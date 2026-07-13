<!-- resources/js/Components/DataTable.vue -->
<script setup>
import { ref, computed } from 'vue'
import TextInput from './TextInput.vue'

const props = defineProps({
  data: Array,
  columns: Array, // [{ key, label, sortable }]
  actions: Boolean,
})

const search = ref('')
const sortKey = ref('')
const sortOrder = ref('asc') // 'asc' ou 'desc'

const filteredData = computed(() => {
  let filtered = props.data
  if (search.value) {
    const term = search.value.toLowerCase()
    filtered = props.data.filter((row) => {
      return props.columns.some((col) => {
        const value = row[col.key]
        return value && value.toString().toLowerCase().includes(term)
      })
    })
  }

  // Ordenação
  if (sortKey.value) {
    filtered = [...filtered].sort((a, b) => {
      let aVal = a[sortKey.value]
      let bVal = b[sortKey.value]
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortOrder.value === 'asc' ? -1 : 1
      if (aVal > bVal) return sortOrder.value === 'asc' ? 1 : -1
      return 0
    })
  }
  return filtered
})

const sort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}
</script>

<template>
  <div>
    <!-- Barra de pesquisa -->
    <div class="mb-4 flex justify-between items-center">
      <TextInput v-model="search" placeholder="Pesquisar..." icon="search" class="w-64" />
      <slot name="actions" />
    </div>

    <!-- Tabela -->
    <div class="overflow-x-auto rounded-lg border border-gray-200">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              <button
                v-if="col.sortable"
                @click="sort(col.key)"
                class="flex items-center space-x-1 hover:text-neutral-700"
              >
                <span>{{ col.label }}</span>
                <span v-if="sortKey === col.key">
                  <svg
                    v-if="sortOrder === 'asc'"
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </span>
              </button>
              <span v-else>{{ col.label }}</span>
            </th>
            <th
              v-if="actions"
              scope="col"
              class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              Ações
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr
            v-for="(row, idx) in filteredData"
            :key="idx"
            class="hover:bg-gray-50 transition-colors"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
            >
              {{ row[col.key] }}
            </td>
            <td v-if="actions" class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button class="text-indigo-600 hover:text-indigo-900 mr-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button class="text-red-600 hover:text-red-900">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </td>
          </tr>
          <tr v-if="filteredData.length === 0">
            <td
              :colspan="columns.length + (actions ? 1 : 0)"
              class="px-6 py-4 text-center text-sm text-gray-500"
            >
              Nenhum resultado encontrado.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
