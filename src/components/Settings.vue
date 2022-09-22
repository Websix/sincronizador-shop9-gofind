<template>
  <v-container fill-height fluid>
    <v-row align="center" justify="center" v-if="loading">
      <v-col cols="12" class="text-center">
        <v-progress-circular
          indeterminate
          color="primary"
        ></v-progress-circular>
      </v-col>
    </v-row>
    <v-row align="center" justify="center" v-else-if="configs">
      <v-col cols="12">
        <v-alert
          v-if="changed"
          border="left"
          color="warning"
          elevation="4"
          prominent
          dense
          type="warning"
        >
          <v-row align="center">
            <v-col class="grow">
              Algumas alterações só terão efeito após reiniciar a aplicação.
            </v-col>
            <v-col class="shrink">
              <v-btn @click="restart">Reiniciar</v-btn>
            </v-col>
          </v-row>
        </v-alert>
        <v-form @submit.prevent="save" v-model="valid" ref="form">
          <v-card class="mb-6" outlined>
            <v-card-title>Configurações</v-card-title>
            <v-card-text>
              <div class="subtitle-2">Banco de dados</div>
              <v-row>
                <v-col cols="6">
                  <v-text-field
                    label="Endereço do servidor"
                    v-model="configs['db.host']"
                    :rules="[rules.required]"
                  ></v-text-field>
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    label="Porta do servidor"
                    type="number"
                    min="1"
                    max="65535"
                    v-model="configs['db.port']"
                    :rules="[
                      rules.requiredWithoutNamedInstance(configs['db.host']),
                      rules.rejectWithNamedInstance(configs['db.host']),
                      rules.portNumber
                    ]"
                  ></v-text-field>
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    label="Nome do usuário"
                    v-model="configs['db.username']"
                    :rules="[rules.required]"
                  ></v-text-field>
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    label="Senha"
                    v-model="configs['db.password']"
                    :append-icon="show_password ? 'mdi-eye' : 'mdi-eye-off'"
                    :rules="[rules.required]"
                    :type="show_password ? 'text' : 'password'"
                    @click:append="show_password = !show_password"
                  ></v-text-field>
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    label="Nome do banco de dados"
                    v-model="configs['db.database']"
                    :rules="[rules.required]"
                  ></v-text-field>
                </v-col>
              </v-row>
            </v-card-text>
            <v-divider class="mx-4"></v-divider>

            <v-card-text>
              <div class="subtitle-2">Api</div>
              <v-text-field
                label="Endpoint"
                v-model="configs['api.endpoint']"
                :rules="[rules.required]"
              ></v-text-field>
              <v-text-field
                label="Token de acesso"
                v-model="configs['api.access_token']"
                :rules="[rules.required]"
              ></v-text-field>
            </v-card-text>
            <v-divider class="mx-4"></v-divider>

            <v-card-text>
              <div class="subtitle-2">Sincronização</div>
              <div class="subtitle-4" v-if="last_synced">
                Ultima execução: {{ last_synced.format("DD/MM/YYYY HH:mm:ss") }}
              </div>
              <v-text-field
                label="Regra CRON"
                type="text"
                min="1"
                hint="Ex: '*/5 * * * *' para executar a cada 5 minutos"
                v-model="configs['sync.cron_rule']"
                :rules="[rules.validCron]"
              ></v-text-field>
              <small class="mt-5">Para mais exemplos de como configurar o CRON, visite <a href="javascript:;" @click.prevent="openExternal('https://crontab.guru')" title="https://crontab.guru">este link</a></small>
            </v-card-text>

            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="red darken-2" text @click="getConfigs">
                Cancelar
              </v-btn>
              <v-btn
                text
                color="primary"
                type="submit"
                :disabled="!valid"
                :loading="loading"
              >
                Salvar
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-form>
      </v-col>
    </v-row>
    <v-row align="center" justify="center" v-else>
      <v-col cols="12">
        <v-alert border="left" color="red" elevation="4" type="error">
          Erro ao carregar as configurações
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { send as sendAsync, dispatch } from "../renderer";
import moment from "moment";
import { isValidCron } from 'cron-validator'
const electron = window.require("electron");
const { ipcRenderer, shell } = electron;

export default {
  name: "Settings",
  data: () => {
    return {
      loading: false,
      valid: true,
      configs: null,
      original: null,
      changed: false,
      last_synced: null,
      show_password: false,
      rules: {
        required: value => !!value || "Campo obrigatório.",
        portNumber: value =>
          (!value || (value >= 1 && value <= 65535)) ||
          "Deve ser uma porta válida: Entre 1 e 65535.",
        positiveNumber: value => value > 0 || "Deve ser um número positivo.",
        validCron: value => isValidCron(value) || "Formato da regra CRON inválido",
        requiredWithoutNamedInstance(host) {
          return value => {
            return (/\\/i.test(host) === false ? !!value : true ) ||
              "Campo obrigatório.";
          }
        },
        rejectWithNamedInstance(host) {
          return value =>
            (/\\/i.test(host) === true ? !value : true) ||
            "Este campo não deve ser utilizado ao se utilizar instancias SQL nomeadas.";
        }
      }
    };
  },
  watch: {
    original: {
      deep: true,
      handler(value, old) {
        if (!value || !old) {
          return;
        }
        this.changed =
          !!this.changed || JSON.stringify(value) !== JSON.stringify(old);
      }
    },
    configs: {
      deep: true,
      handler() {
        this.$nextTick(() => {
          this.$refs.form ? this.$refs.form.validate() : null;
        });
      }
    }
  },
  methods: {
    loadConfig() {
      this.loading = true;
      return sendAsync({ action: "configs.all", args: null })
        .then(res => {
          this.original = res;
          this.getConfigs();
        })
        .finally(() => {
          this.loading = false;
        });
    },
    getConfigs() {
      if (!this.original || !Array.isArray(this.original)) return;
      this.configs = this.original.reduce(
        (configs, conf) => ((configs[conf.key] = conf.value), configs),
        {}
      );
      if (!this.last_synced) {
        let last_synced = this.configs["sync.last_synced"];
        this.last_synced = last_synced ? moment(last_synced) : null;
      }
    },
    save() {
      if (!this.$refs.form.validate()) return;

      this.loading = true;
      let rows = [];
      Object.keys(this.configs).forEach(item => {
        if (item === "sync.last_synced") return;
        rows.push({ key: item, value: this.configs[item] });
      });
      return sendAsync({ action: "configs.save", args: rows }).then(() =>
        this.loadConfig()
      );
    },
    restart() {
      // eslint-disable-next-line
      dispatch("trigger-app-relaunch").catch(console.error);
    },
    onCronFinished() {
      return sendAsync({ action: "configs.get", args: "sync.last_synced" })
        .then(res => {
          let last_synced = res;
          this.last_synced = last_synced ? moment(last_synced) : null;
        })
        .finally(() => {
          this.loading = false;
        });
    },
    openExternal(url) {
      shell.openExternal(url);
    }
  },
  created() {
    // eslint-disable-next-line
    this.loadConfig().catch(console.error);
    ipcRenderer.on("cron_finished", this.onCronFinished);
  },
  beforeDestroy() {
    ipcRenderer.removeListener("cron_finished", this.onCronFinished);
  }
};
</script>
