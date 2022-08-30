<template>
  <v-app>
    <v-main>
      <Settings />
    </v-main>
  </v-app>
</template>

<script>
import Settings from "./components/Settings";

export default {
  name: "App",
  components: {
    Settings
  },
  data: () => ({})
};
</script>
