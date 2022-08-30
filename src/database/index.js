import { app } from 'electron';
import sqlite3 from 'sqlite3';
import mssql from 'mssql';
import path from 'path';
import log from 'electron-log';

// Sqlite connection - For APP data
const dbFilePath = path.join(
  app.getPath('userData'),
  'data.db3'
);

const sqliteDb = new sqlite3.Database(dbFilePath, (err) => {
    if (err) {
      log.error('Database opening error: ', err);
      return;
    } else {
      sqliteDb.run(`CREATE TABLE IF NOT EXISTS "configs" (
        "key"  TEXT NOT NULL UNIQUE,
        "value"  TEXT,
        PRIMARY KEY("key")
      )`, function(err) {
        if (err) log.error('Error creating configs table: ', err);
      });
    }
});

const configs = {
  all() {
    return new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM configs', (err, rows) => {
        if (!!err) {
          reject(err);
          return
        }
        resolve(rows);
      });
    });
  },
  get(key) {
    return new Promise((resolve, reject) => {
      let stmt = sqliteDb.prepare(`SELECT * FROM configs WHERE key IN (${[...arguments].map(() => "?").join(", ")})`);
      if (arguments.length > 1) {
        stmt.all([...arguments], (err, rows) => {
          if (!!err) {
            reject(err);
            return
          }
          resolve(rows.reduce(
            (configs, conf) => ((configs[conf.key] = conf.value), configs),
            {}
          ));
        });
      } else {
        stmt.get(key, (err, conf) => {
          if (!!err) {
            reject(err);
            return
          }
          resolve(conf ? conf.value : null);
        });
      }
    })
  },
  save(args) {
    return new Promise((resolve, reject) => {
      let stmt = sqliteDb.prepare('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)');
      let promises = [];
      if (!Array.isArray(args)) {
        args = [args];
      }
      args.forEach(({key, value}) => {
        promises.push(new Promise(resolve => {
          stmt.run(key, value, resolve);
        }));
      });
      stmt.finalize();
      Promise.all(promises)
        .then(() => {
          resolve(null)
        })
        .catch(reject)
    });
  },
};

// Sql Server Connection - For ERP data
mssql.on('error', log.error);

var mssqlConfig = null
function mssqlConnection () {
  if (mssqlConfig) {
    return mssql.connect(mssqlConfig)
  }
  return getMssqlConfig().then(cfg => {
    mssqlConfig = cfg;
    return mssql.connect(cfg);
  });
}

function getMssqlConfig() {
  return configs.all()
    .then(rows => {
      let conf = rows.reduce(
        (cgf, conf) => ((cgf[conf.key] = conf.value), cgf),
        {}
      );
      let cfg = {
        user: conf['db.username'],
        password: conf['db.password'],
        server: conf['db.host'],
        database: conf['db.database'],
        options: {
          encrypt: false,
          enableArithAbort: true
        }
      };

      if (/\\/i.test(conf['db.host']) === false) {
        cfg.port = parseInt(conf['db.port']);
      } else {
        let host = conf['db.host'].replaceAll(/\\+/ig, '\\').split('\\');
        cfg.server = host[0];
        cfg.options.instanceName = host[1];
      }
      return cfg;
    }).catch(err => {
      log.error(err);
      return null;
    });
};

const customers = {
  all() {
    return mssqlConnection().then(pool => {
      return pool.request()
      .query(`
        SELECT 1
      `)
      .then(({recordsets}) => recordsets[0])
    })
  },
}

export default {
  configs,
  customers,
}
