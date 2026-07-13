<script setup>
import { Head } from '@inertiajs/vue3'
import { ref } from 'vue'
import TextInput from '../components/TextInput.vue'
import Button from '../components/Button.vue'

const email = ref('')
const submitted = ref(false)

const submit = () => {
  //console.log('Forgot password request for:', email.value)
  submitted.value = true
  // enviar para o backend
}
</script>

<template>
  <Head title="Recuperar Senha" />

  <div class="min-h-screen bg-[#EFFAFD] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="text-center">
        <svg class="mx-auto h-12 w-12 text-[#4A8BDF]" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v4h-4v2h4v4h2v-4h4v-2h-4V7h-2z"
          />
        </svg>
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900">Recuperar senha</h2>
        <p class="mt-2 text-sm text-gray-600">
          Lembrou sua senha?
          <a
            href="/auth/login"
            class="font-medium text-[#A0006D] hover:text-[#7f0057] transition-colors duration-200"
          >
            faça login
          </a>
        </p>
      </div>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow-xl rounded-lg sm:px-10">
        <div v-if="!submitted">
          <p class="text-sm text-gray-600 mb-6">
            Digite seu e-mail e enviaremos um link para redefinir sua senha.
          </p>
          <form @submit.prevent="submit" class="space-y-6">
            <TextInput
              v-model="email"
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              icon="email"
              required
            />

            <Button type="submit" variant="primary"> Enviar link </Button>
          </form>
        </div>

        <div v-else class="text-center">
          <svg
            class="mx-auto h-12 w-12 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900">E-mail enviado!</h3>
          <p class="mt-2 text-sm text-gray-600">
            Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
          </p>
          <button
            @click="submitted = false"
            class="mt-4 text-sm font-medium text-[#4A8BDF] hover:text-[#3a6eb0]"
          >
            Tentar outro e-mail
          </button>
        </div>
      </div>
    </div>

    <div
      class="text-sm text-center [&>code]:font-medium [&>code]:text-[#a599ff] bg-gray-800 text-white fixed bottom-0 left-0 right-0 py-2"
    >
      Rota para esta página registrada em <code>start/routes.ts</code>, renderizando
      <code>inertia/pages/Auth/ForgotPassword.vue</code>
    </div>
  </div>
</template>
