<script setup>
import { Head } from '@inertiajs/vue3'
import { ref } from 'vue'
import TextInput from '../components/TextInput.vue'
import Checkbox from '../components/Checkbox.vue'
import Button from '../components/Button.vue'

const form = ref({
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
  terms: false,
})

const submit = () => {
  //console.log('Register', form.value)
  // enviar para o backend
}
</script>

<template>
  <Head title="Criar Conta" />

  <div class="min-h-screen bg-[#EFFAFD] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="text-center">
        <svg class="mx-auto h-12 w-12 text-[#4A8BDF]" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v4h-4v2h4v4h2v-4h4v-2h-4V7h-2z"
          />
        </svg>
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900">Crie sua conta</h2>
        <p class="mt-2 text-sm text-gray-600">
          Ou
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
        <form @submit.prevent="submit" class="space-y-6">
          <TextInput
            v-model="form.name"
            label="Nome completo"
            type="text"
            placeholder="Seu nome"
            icon="user"
            required
          />

          <TextInput
            v-model="form.email"
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            icon="email"
            required
          />

          <TextInput
            v-model="form.password"
            label="Senha"
            type="password"
            placeholder="••••••••"
            icon="lock"
            required
          />

          <TextInput
            v-model="form.password_confirmation"
            label="Confirmar senha"
            type="password"
            placeholder="••••••••"
            icon="lock"
            required
          />

          <div class="flex items-center">
            <Checkbox v-model="form.terms" />
            <label class="ml-2 block text-sm text-gray-900">
              Eu concordo com os
              <a href="#" class="font-medium text-[#A0006D] hover:text-[#7f0057]">
                termos de uso
              </a>
            </label>
          </div>

          <Button type="submit" variant="primary"> Cadastrar </Button>
        </form>
      </div>
    </div>

    <div
      class="text-sm text-center [&>code]:font-medium [&>code]:text-[#a599ff] bg-gray-800 text-white fixed bottom-0 left-0 right-0 py-2"
    >
      Rota para esta página registrada em <code>start/routes.ts</code>, renderizando
      <code>inertia/pages/Auth/Register.vue</code>
    </div>
  </div>
</template>
