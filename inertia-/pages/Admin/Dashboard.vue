<!-- resources/js/Pages/Admin/Dashboard.vue -->
<script setup>
import { Head } from '@inertiajs/vue3'
import { ref } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import DataTable from '../components/DataTable.vue'
import Button from '../components/Button.vue'

const sidebarCollapsed = ref(false)

// Dados mockados para a tabela de Utilizadores
const usersData = [
  { id: 1, name: 'João Silva', email: 'joao@exemplo.pt', role: 'Admin', created_at: '2025-01-10' },
  {
    id: 2,
    name: 'Maria Santos',
    email: 'maria@exemplo.pt',
    role: 'Gestor',
    created_at: '2025-02-15',
  },
  {
    id: 3,
    name: 'Carlos Pereira',
    email: 'carlos@exemplo.pt',
    role: 'Editor',
    created_at: '2025-03-01',
  },
  {
    id: 4,
    name: 'Ana Costa',
    email: 'ana@exemplo.pt',
    role: 'Visualizador',
    created_at: '2025-03-12',
  },
  {
    id: 5,
    name: 'Pedro Almeida',
    email: 'pedro@exemplo.pt',
    role: 'Admin',
    created_at: '2025-02-20',
  },
]

const columns = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'name', label: 'Nome', sortable: true },
  { key: 'email', label: 'E-mail', sortable: true },
  { key: 'role', label: 'Papel', sortable: true },
  { key: 'created_at', label: 'Criado em', sortable: true },
]
</script>

<template>
  <Head title="Dashboard Admin" />

  <div class="min-h-screen bg-[#EFFAFD]">
    <!-- Sidebar -->
    <Sidebar v-model="sidebarCollapsed" />

    <!-- Conteúdo principal -->
    <main class="transition-all duration-300 p-6" :class="sidebarCollapsed ? 'ml-20' : 'ml-64'">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-bold text-gray-900">Utilizadores</h1>
          <p class="text-gray-600 mt-1">Gestão de utilizadores, papéis e permissões.</p>
        </div>

        <!-- Tabela com ações -->
        <DataTable :data="usersData" :columns="columns" actions>
          <template #actions>
            <Button variant="primary" class="!w-auto px-4 py-2 text-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Novo Utilizador
            </Button>
          </template>
        </DataTable>

        <!-- Secção de papéis/permissões (pode ser outra tabela) -->
        <div class="mt-12">
          <h2 class="text-2xl font-bold text-gray-900 mb-4">Papéis e Permissões</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 class="font-semibold text-lg mb-3">Papéis</h3>
              <ul class="space-y-2">
                <li class="flex justify-between items-center">
                  <span>Admin</span>
                  <span class="text-sm text-gray-500">5 utilizadores</span>
                </li>
                <li class="flex justify-between items-center">
                  <span>Gestor</span>
                  <span class="text-sm text-gray-500">3 utilizadores</span>
                </li>
                <li class="flex justify-between items-center">
                  <span>Editor</span>
                  <span class="text-sm text-gray-500">2 utilizadores</span>
                </li>
              </ul>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 class="font-semibold text-lg mb-3">Permissões (exemplo)</h3>
              <ul class="space-y-1 text-sm">
                <li><span class="font-medium">ver_utilizadores</span> - GET /api/users</li>
                <li><span class="font-medium">criar_utilizadores</span> - POST /api/users</li>
                <li><span class="font-medium">editar_utilizadores</span> - PUT /api/users/:id</li>
                <li>
                  <span class="font-medium">eliminar_utilizadores</span> - DELETE /api/users/:id
                </li>
                <li><span class="font-medium">gerir_papeis</span> - GET/POST /api/roles</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
