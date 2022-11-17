import { app } from "electron";
import sqlite3 from "sqlite3";
import mssql from "mssql";
import path from "path";
import log from "electron-log";
import moment from "moment";

// Sqlite connection - For APP data
const dbFilePath = path.join(app.getPath("userData"), "data.db3");

const sqliteDb = new sqlite3.Database(dbFilePath, err => {
  if (err) {
    log.error("Database opening error: ", err);
    return;
  } else {
    sqliteDb.run(
      `CREATE TABLE IF NOT EXISTS "configs" (
        "key"  TEXT NOT NULL UNIQUE,
        "value"  TEXT,
        PRIMARY KEY("key")
      )`,
      function(err) {
        if (err) log.error("Error creating configs table: ", err);
      }
    );
  }
});

const configs = {
  all() {
    return new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM configs", (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  },
  get(key) {
    return new Promise((resolve, reject) => {
      let stmt = sqliteDb.prepare(
        `SELECT * FROM configs WHERE key IN (${[...arguments]
          .map(() => "?")
          .join(", ")})`
      );
      if (arguments.length > 1) {
        stmt.all([...arguments], (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(
            rows.reduce(
              (configs, conf) => ((configs[conf.key] = conf.value), configs),
              {}
            )
          );
        });
      } else {
        stmt.get(key, (err, conf) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(conf ? conf.value : null);
        });
      }
    });
  },
  save(args) {
    return new Promise((resolve, reject) => {
      let stmt = sqliteDb.prepare(
        "INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)"
      );
      let promises = [];
      if (!Array.isArray(args)) {
        args = [args];
      }
      args.forEach(({ key, value }) => {
        promises.push(
          new Promise(resolve => {
            stmt.run(key, value, resolve);
          })
        );
      });
      stmt.finalize();
      Promise.all(promises)
        .then(() => {
          resolve(null);
        })
        .catch(reject);
    });
  }
};

// Sql Server Connection - For ERP data
mssql.on("error", log.error);

var mssqlConfig = null;
async function mssqlConnection() {
  let cfg = mssqlConfig || (await getMssqlConfig());
  return mssql.connect(cfg);
}

async function getMssqlConfig() {
  let rows = await configs.all();
  try {
    let conf = rows.reduce(
      (cgf, conf) => ((cgf[conf.key] = conf.value), cgf),
      {}
    );
    let cfg = {
      user: conf["db.username"],
      password: conf["db.password"],
      server: conf["db.host"],
      database: conf["db.database"],
      options: {
        encrypt: false,
        enableArithAbort: true
      }
    };

    if (/\\/i.test(conf["db.host"]) === false) {
      cfg.port = parseInt(conf["db.port"]);
    } else {
      let host = conf["db.host"].replaceAll(/\\+/gi, "\\").split("\\");
      cfg.server = host[0];
      cfg.options.instanceName = host[1];
    }
    return cfg;
  } catch (err) {
    log.error(err);
    return null;
  }
}

const orders = {
  async pendingSync() {
    const pool = await mssqlConnection();
    const params = await configs.get("sync.last_synced", )
    const last_synced = await configs.get("sync.last_synced");
    const after_date = moment(last_synced).isValid() ? moment(last_synced) : moment().startOf("day");

    const { recordsets } = await pool.request().query(`
      SELECT
        nfe.*,
        cli.*
      FROM dbo.View_Movimento_Resumo_NFe nfe
      JOIN dbo.View_Cli_For_Movimento cli
        ON nfe.Cli_For_Codigo = cli.Codigo
      WHERE nfe.Entrada_Saida = 'S'
        AND CAST(nfe.Data AS DATE) >= CAST('${after_date.format(
          "YYYY-MM-DD"
        )}' AS DATE)
        AND nfe.Documento_Cancelado = 0
        AND nfe.Filial_Codigo in (3,5,6) AND nfe.Data_Autorizacao IS NOT NULL
        AND EXISTS (SELECT 1 FROM dbo.View_Movimento_Prod_Serv m WHERE m.Ordem_Movimento = nfe.Ordem_Movimento AND m.Codigo_Fabricante = 39);
    `);

    return recordsets[0];
  },

  async products(orderId) {
    const pool = await mssqlConnection();

    const { recordsets } = await pool.request().query(`
      SELECT
        Ordem,
        Ordem_Movimento,
        Codigo,
        Nome,
        Quantidade,
        Nome_Unidade_Venda,
        Preco_Unitario,
        Preco_Final,
        Codigo_Fabricante,
        Nome_Fabricante,
        NCM,
        Codigo_Barras
      FROM dbo.View_Movimento_Prod_Serv
      WHERE Ordem_Movimento = ${orderId}
        AND Codigo_Fabricante = 39;
    `);

    return recordsets[0];
  },

  async customer(customerId) {
    const pool = await mssqlConnection();

    const { recordsets } = await pool.request().query(`
      SELECT
        *
      FROM dbo.View_Cli_For_Movimento
      WHERE Codigo = ${customerId};
    `);

    return recordsets[0];
  },

  async filiais(ids) {
    const pool = await mssqlConnection();
    if (ids !== undefined || ids !== null) {
      ids = Array.isArray(ids) ? ids : [ids];
    }

    const { recordsets } = await pool.request().query(`
      SELECT
        *
      FROM dbo.Filiais
      ${ !!ids ? 'WHERE Codigo IN (' + ids.join(',') + ')' : ''};
    `);

    return recordsets[0];
  }
};

export default {
  configs,
  orders
};
