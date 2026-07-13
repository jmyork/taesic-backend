<script setup>
import { Head } from '@inertiajs/vue3'
import { ref } from 'vue'
import TextInput from '../components/TextInput.vue'
import Button from '../components/Button.vue'

const props = defineProps({
  token: String,
  email: String,
})

const form = ref({
  email: props.email || '',
  password: '',
  password_confirmation: '',
  token: props.token || '',
})

const submit = () => {
  //console.log('Reset password', form.value)
  // enviar para o backend
}
</script>

<template>
  <Head title="Redefinir Senha" />

  <div class="min-h-screen bg-[#EFFAFD] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="text-center">
        <svg class="mx-auto h-12 w-12 text-[#4A8BDF]" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v4h-4v2h4v4h2v-4h4v-2h-4V7h-2z"
          />
        </svg>
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900">Redefinir senha</h2>
      </div>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow-xl rounded-lg sm:px-10">
        <form @submit.prevent="submit" class="space-y-6">
          <TextInput
            v-model="form.email"
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            icon="email"
            required
            :readonly="!!props.email"
          />

          <TextInput
            v-model="form.password"
            label="Nova senha"
            type="password"
            placeholder="••••••••"
            icon="lock"
            required
          />

          <TextInput
            v-model="form.password_confirmation"
            label="Confirmar nova senha"
            type="password"
            placeholder="••••••••"
            icon="lock"
            required
          />

          <Button type="submit" variant="primary"> Redefinir senha </Button>
        </form>
      </div>
    </div>

    <div
      class="text-sm text-center [&>code]:font-medium [&>code]:text-[#a599ff] bg-gray-800 text-white fixed bottom-0 left-0 right-0 py-2"
    >
      Rota para esta página registrada em <code>start/routes.ts</code>, renderizando
      <code>inertia/pages/Auth/ResetPassword.vue</code>
    </div>
  </div>
</template>
