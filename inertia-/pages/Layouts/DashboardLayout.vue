<!-- resources/js/Layouts/DashboardLayout.vue -->
<script setup>
import { ref, onMounted, provide } from 'vue'
import Sidebar from '@/Components/Sidebar/Sidebar.vue'

const isSidebarOpen = ref(true)

// Carregar preferência do localStorage
onMounted(() => {
  const saved = localStorage.getItem('sidebarOpen')
  if (saved !== null) isSidebarOpen.value = saved === 'true'
})

// Fornecer estado para componentes filhos (opcional)
provide('sidebarState', { isSidebarOpen })
</script>

<template>
  <div class="min-h-screen bg-[#EFFAFD]">
    <!-- Sidebar -->
    <Sidebar v-model:open="isSidebarOpen" />

    <!-- Conteúdo principal -->
    <main
      class="transition-all duration-300 ease-in-out"
      :class="isSidebarOpen ? 'ml-64' : 'ml-20'"
    >
      <div class="p-6">
        <slot />
      </div>
    </main>
  </div>
</template>
