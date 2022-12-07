import { app } from "electron";
import { CronJob } from "cron";
import EventEmitter from "events";
import axios from "axios";
import db from "./database";
import moment from "moment";
import log from "electron-log";
import { updater } from "./updater";

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

        if (process.env.NODE_ENV === "production" && !process.env.IS_TEST) {
          (new CronJob(
            '0 0 * * *', // diariamente meia noite
            async () => {
              updater.checkForUpdates()
              updater.once('update-available', () => {
                updater.downloadUpdate();
                updater.once('update-downloaded', () => {
                  if (isRunning) {
                    events.once('cron_finished', updater.quitAndInstall)
                  } else {
                    updater.quitAndInstall()
                  }
                });
              });
            },
            null,
            false,
            "America/Sao_Paulo"
          )).start();
        }
      })
      .catch(log.error);
  }
};

async function task() {
  if (!isRunning) {
    console.time('cron');
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
      let perChunk = 15;

      const filiais = (await db.orders.filiais([3,5,6])).reduce((acc, curr) => {
        acc[curr['Codigo']] = curr;
        return acc;
      }, {});

      await Promise.all(chunkArray(orders, perChunk).map(async chunk => {
          const body = (await Promise.allSettled(chunk.map(async (row, i) => {
            const products = await db.orders.products(row['Ordem_Movimento']);
            const filial = filiais[row['Filial_Codigo']];
            // Todas as datas devem ser no formato padrão do JSON (yyyy-MM-dd'T'HH:mm:ss). Exemplo: "2018-01-01T07:00:00"
            return {
              Id: `${row["Chave_Acesso"] || ''}`, // ID da NFe (SEFAZ).
              ide: {
                // Informações de emissão da NF
                dhEmi: `${moment(row["Data_Emissao"]).format() || ''}`, // Data de emissão da NF
                // dhSaiEnt: null, // Data de saida da NF
                nNF: `${row["Numero_NFe"] || ''}`, // Número da nota fiscal
                serie: `${row["Serie"] || ''}`, // Série da nota fiscal
              },
              emit: {
                CNPJ: `${(filial["CNPJ"] || "").replaceAll(/\D/g, "")}`,
                enderEmit: {
                  CEP: `${filial["CEP"] || ''}`,
                  fone: `${filial["Fone"] || ''}`,
                  nro: `${filial["Numero"] || ''}`,
                  UF: `${filial["UF"] || ''}`,
                  xBairro: `${filial["Bairro"] || ''}`,
                  xCpl: `${filial["Complemento"] || ''}`,
                  xLgr: `${filial["Endereco"] || ''}`,
                  xMun: `${filial["Cidade"] || ''}`,
                  // xPais: '', // Assume BR como padrao. Se for informar, precisa ser diferente de BR
                },
                IE: `${filial["Inscricao_Estadual"] || ''}`,
                xNome: `${filial["Razao_Social"] || ''}`,
                xFant: '',
              },
              dest: {
                [`${row['TipoPessoa'] === 'F' ? 'CPF' : 'CNPJ'}`]: `${(row["CliDoc"] || '').replaceAll(/\D/g, "")}`,
                // RUC: ', // Assume BR como padrao. Se for informar, precisa ser diferente de BR
                email: '',
                enderDest: {
                  CEP: `${row["CEP"] || ''}`,
                  fone: `${(row["Fone_1"] || "").replaceAll(/\D/g, "")}`,
                  nro: `${row["Numero"] || ''}`,
                  UF: `${row["Estado"] || ''}`,
                  xBairro: `${row["Bairro"] || ''}`,
                  xCpl: `${row["Complemento"] || ''}`,
                  xLgr: `${row["Endereco"] || ''}`,
                  xMun: `${row["Cidade"] || ''}`,
                  // xPais: null, // Assume BR como padrao. Se for informar, precisa ser diferente de BR
                },
                IE: `${row["Inscricao_Estadual_PF"] || ''}`,
                xNome: `${row["Nome"] || ''}`,
                xFant: `${row["Fantasia"] || ''}`,
              },
              // "entrega": { // opcional
              //   "CEP": "",
              //   "fone": "",
              //   "nro": "",
              //   "UF": "",
              //   "xBairro": "",
              //   "xCpl": "",
              //   "xLgr": "",
              //   "xMun": "",
              //   "xPais": "",
              // },
              det: products.map((prod, index) => ({
                nItem: `${(1 + index)}`,
                prod: {
                  cEAN: `${prod["Codigo_Barras"] || ''}`,
                  cEANTrib: `${prod["EAN_Tributavel"] || ''}`,
                  CFOP: `${prod["CFOP_NF"] || ''}`,
                  cProd: `${prod["Codigo"] || ''}`,
                  NCM: `${prod["NCM"] || ''}`,
                  qCom: `${parseInt(prod["Quantidade"] || 0)}`,
                  // "qTrib": prod['Quantidade'], // opcional
                  uCom:`${
                    prod["Nome_Unidade_Venda"] === "CJ"
                      ? "UN"
                      : (prod["Nome_Unidade_Venda"] || '')
                  }`,
                  // "uTrib": "",
                  xProd: `${prod["Nome"] || ''}`,
                },
              })),
            };
          }))).reduce((acc, item) => {
            if (item.status === 'fulfilled') {
              acc.push(item.value);
            } else {
              log.error(item.reason);
            }
            return acc;
          }, []);

          try {
            await axios.post(endpoint, body, axiosConfig);
          } catch (error) {
            log.error(error.response);
          }
      }));
    } catch (error) {
        log.error(error.message)
    } finally {
      await db.configs.save({ key: "sync.last_synced", value: moment().format() });
      events.emit("cron_finished");
      isRunning = false;

      setTimeout(() => {
        events.emit("cron_status", isRunning);
      }, 3000);

      console.timeEnd('cron');
    }
  }
}

function chunkArray(array, size) {
  if (array.length <= size) {
    return [array];
  }
  return [array.slice(0, size), ...chunkArray(array.slice(size), size)];
}
