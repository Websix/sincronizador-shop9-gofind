import { app } from 'electron';
import { CronJob } from 'cron';
import EventEmitter from 'events';
import axios from 'axios';
import db from './database';
import moment from 'moment';
import log from 'electron-log';

var isRunning = false;
var currentJob = null;
var events = new EventEmitter;

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
    db.configs.get('sync.cron_rule').then((cron_rule) => {
      if (cron_rule) {
        currentJob = (new CronJob(`${(cron_rule)}`, task, null, false, 'America/Sao_Paulo')); // cas
        currentJob.start();
      }
    })
    .catch(log.error);
  }
}

async function task() {

  if (!isRunning) {
    isRunning = true;
    events.emit('cron_status', isRunning);
    db.configs.get('api.endpoint', 'api.access_token')
      .then(config => {
        if (!config['api.endpoint'] || !('' + config['api.endpoint']).trim()) {
          throw new Error('api.endpoint config not set!');
        }

        let apiUrl = config['api.endpoint'];
        let endpoint = apiUrl.replace(/\/$/i, '') + '/customer';
        let access_token = (config['api.access_token'] || '').trim();

        let axiosConfig = {
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            'user-agent': `${app.getName()}/${app.getVersion()}`,
            ...(access_token ? { 'X-Api-Key' : access_token } : {})
          }
        }

        return db.customers.all()
          .then(async (customers) => {
            let perChunk = 15;
            let results = [];
            let requests = customers.slice(0);

            let sendBatch = async (chunks, results) => {
              let curr;
              try {
                curr = await Promise.all(chunks.map(async (customer) => {
                  return axios.post(endpoint, [
                    {}
                  ], axiosConfig)
                  .catch(err => {
                    log.error(err.message)
                    if (err.response) {
                      let { data } = err.response;
                      log.warn(data.message);
                      log.debug(data);
                    }
                    return err.response || {};
                  }).then(res => {
                    return res.status;
                  });
                }));
                results.push(curr);
              } catch(err) {
                throw err
              }
              return curr !== undefined && requests.length
                 ? sendBatch(requests.splice(0, perChunk), results)
                 : results
            }
            return sendBatch(requests.splice(0, perChunk), results).catch(log.error)
          });
      })
      .then((r) => {
        db.configs.save({ key: 'sync.last_synced', value: moment().format() });
        events.emit('cron_finished');
      })
      .catch(log.error)
      .finally(() => {
        isRunning = false;
        setTimeout(() => {
          events.emit('cron_status', isRunning);
        }, 3000)
      });
  }
}

function chunkArray(array, size) {
  if(array.length <= size){
    return [array]
  }
  return [array.slice(0,size), ...chunkArray(array.slice(size), size)]
}