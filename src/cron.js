import { app } from "electron";
import { CronJob } from "cron";
import EventEmitter from "events";
import axios from "axios";
import db from "./database";
import moment from "moment";
import log from "electron-log";

var isRunning = false;
var currentJob = null;
var events = new EventEmitter();

export default {
  get isRunning() {
    return isRunning;
  },
  get currentJob() {
    return currentJob;
  },
  get events() {
    return events;
  },
  run() {
    db.configs
      .get("sync.cron_rule")
      .then(cron_rule => {
        if (cron_rule) {
          currentJob = new CronJob(
            `${cron_rule}`,
            task,
            null,
            false,
            "America/Sao_Paulo"
          ); // cas
          currentJob.start();
        }
      })
      .catch(log.error);
  }
};

async function task() {
  if (!isRunning) {

    isRunning = true;
    events.emit("cron_status", isRunning);
    const config = await db.configs.get("api.endpoint", "api.access_token");

    if (!config["api.endpoint"] || !("" + config["api.endpoint"]).trim()) {
      throw new Error("api.endpoint config not set!");
    }

    let endpoint = config["api.endpoint"];
    let access_token = (config["api.access_token"] || "").trim();

    let axiosConfig = {
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": `${app.getName()}/${app.getVersion()}`,
        ...(access_token ? { "X-Api-Key": access_token } : {})
      }
    };

    try {
      const orders = await db.orders.pendingSync();
      let perChunk = 2;
      let results = [];
      let requests = orders.slice(0);
      const filiais = (await db.orders.filiais([3,5,6])).reduce((acc, curr) => {
        acc[curr['Codigo']] = curr;
        return acc;
      }, {});

      requests.splice(0, perChunk).forEach(async chunk => {
        try {
          response = await axios.post(
            endpoint,
            chunk.map(async row => {
              const products = await db.orders.products(row['Ordem_Movimento']);
              const filial = filiais[row['Filial_Codigo']];
              // Todas as datas devem ser no formato padrão do JSON (yyyy-MM-dd'T'HH:mm:ss). Exemplo: "2018-01-01T07:00:00"
              return {
                "Id": row['Chave_Acesso'], // ID da NFe (SEFAZ).
                "ide": { // Informações de emissão da NF
                  "dhEmi": moment(row['Data_Emissao']).format(), // Data de emissão da NF
                  "dhSaiEnt":  null, // Data de saida da NF
                  "nNF": row['Numero'], // Número da nota fiscal
                  "serie": row['Serie'] // Série da nota fiscal
                },
                "emit": {
                  "CNPJ": filial['CNPJ'],
                  "enderEmit": {
                    "CEP": filial['CEP'],
                    "fone": filial['Fone'],
                    "nro": filial['Numero'],
                    "UF": filial['UF'],
                    "xBairro": filial['Bairro'],
                    "xCpl": filial['Complemento'],
                    "xLgr": filial['Endereco'],
                    "xMun": filial['Cidade'],
                    "xPais": null // Assume BR como padrao. Se for informar, precisa ser diferente de BR
                  },
                  "IE": filial['Inscricao_Estadual'],
                  "xNome": filial['Razao_Social'],
                  "xFant": null
                },
                "dest": {
                  "CNPJ": "",
                  "RUC": "",
                  "email": "",
                  "enderDest": {
                    "CEP": "",
                    "fone": "",
                    "nro": "",
                    "UF": "",
                    "xBairro": "",
                    "xCpl": "",
                    "xLgr": "",
                    "xMun": "",
                    "xPais": ""
                  },
                  "IE": "",
                  "xNome": "",
                  "xFant": ""
                },
                "entrega": {
                  "CEP": "",
                  "fone": "",
                  "nro": "",
                  "UF": "",
                  "xBairro": "",
                  "xCpl": "",
                  "xLgr": "",
                  "xMun": "",
                  "xPais": ""
                },
                "det": products.map((prod) => ({
                    "nItem": "",
                    "prod": {
                      "cEAN": "",
                      "cEANTrib": "",
                      "CFOP": "",
                      "cProd": "",
                      "NCM": "",
                      "qCom": "",
                      "qTrib": "",
                      "uCom": "",
                      "uTrib": "",
                      "xProd": ""
                    }
                  }
                ))
              }
            }),
            axiosConfig
          )
        } catch (error) {
          console.error(error.message);
        }
      });
    } catch (error) {
        log.error(error.message)
    } finally {
      // db.configs.save({ key: "sync.last_synced", value: moment().format() });
      events.emit("cron_finished");

      isRunning = false;
      setTimeout(() => {
        events.emit("cron_status", isRunning);

      }, 3000);
    }
  }
}

function chunkArray(array, size) {
  if (array.length <= size) {
    return [array];
  }
  return [array.slice(0, size), ...chunkArray(array.slice(size), size)];
}
