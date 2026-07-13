<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3'
import { ref } from 'vue'
import TextInput from '../components/TextInput.vue'
import Checkbox from '../components/Checkbox.vue'
import Button from '../components/Button.vue'

const email = ref('')
const password = ref('')
const remember = ref(false)

const submit = () => {
  // lógica de login
  //console.log('Login', { email: email.value, password: password.value, remember: remember.value })
}
</script>

<template>
  <Head title="Login" />

  <div class="min-h-screen bg-[#EFFAFD] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <svg class="mx-auto h-12 w-12 text-[#4A8BDF]" fill="currentColor" viewBox="0 0 24 24">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v4h-4v2h4v4h2v-4h4v-2h-4V7h-2z"
        />
      </svg>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Acesse sua conta</h2>
      <p class="mt-2 text-center text-sm text-gray-600">
        Ou
        <Link
          href="/auth/register"
          class="font-medium text-[#A0006D] hover:text-[#7f0057] transition-colors duration-200"
        >
          crie uma nova conta
        </Link>
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow-xl rounded-lg sm:px-10">
        <form @submit.prevent="submit" class="space-y-6">
          <TextInput
            id="email"
            label="E-mail"
            type="email"
            icon="email"
            v-model="email"
            required
            autocomplete="email"
          />

          <TextInput
            id="password"
            label="Senha"
            type="password"
            icon="password"
            v-model="password"
            required
            autocomplete="current-password"
          />

          <div class="flex items-center justify-between">
            <Checkbox id="remember" v-model="remember" label="Lembrar-me" />
            <Link
              href="/auth/forgot-password"
              class="text-sm font-medium text-[#A0006D] hover:text-[#7f0057] transition-colors duration-200"
            >
              Esqueceu a senha?
            </Link>
          </div>

          <Button type="submit" variant="primary" class="w-full"> Entrar </Button>
        </form>
      </div>
    </div>

    <!-- Rodapé informativo (pode ser removido se não quiser) -->
    <div
      class="text-sm text-center [&>code]:font-medium [&>code]:text-[#a599ff] bg-gray-800 text-white fixed bottom-0 left-0 right-0 py-2"
    >
      Rota: <code>start/routes.ts</code> → <code>inertia/pages/Login.vue</code>
    </div>
  </div>
</template>
