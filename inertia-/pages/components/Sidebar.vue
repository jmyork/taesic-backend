<!-- resources/js/Components/Sidebar.vue -->
<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: Boolean, // collapsed state
})

const emit = defineEmits(['update:modelValue'])

const collapsed = ref(props.modelValue)

// Menu items com submenus
const menuItems = [
  {
    title: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    link: '/admin',
  },
  {
    title: 'Gestão',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    children: [
      {
        title: 'Utilizadores',
        link: '/admin/users',
        icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
      },
      {
        title: 'Papéis',
        link: '/admin/roles',
        icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      },
      {
        title: 'Permissões',
        link: '/admin/permissions',
        icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
      },
    ],
  },
  {
    title: 'Sistema',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    children: [
      {
        title: 'Auditoria',
        link: '/admin/audit',
        icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      },
      {
        title: 'Configurações',
        link: '/admin/settings',
        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
      },
    ],
  },
]

const openSubmenus = ref([])

const toggleSubmenu = (index) => {
  if (openSubmenus.value.includes(index)) {
    openSubmenus.value = openSubmenus.value.filter((i) => i !== index)
  } else {
    openSubmenus.value.push(index)
  }
}

const toggleCollapse = () => {
  emit('update:modelValue', !collapsed.value)
}
</script>

<template>
  <aside
    class="h-screen fixed left-0 top-0 bg-gray-900 text-white transition-all duration-300 z-30 flex flex-col"
    :class="collapsed ? 'w-20' : 'w-64'"
  >
    <!-- Logo / Collapse button -->
    <div class="flex items-center justify-between p-4 border-b border-gray-700">
      <div v-if="!collapsed" class="font-bold text-xl text-white">AuthAdmin</div>
      <button @click="toggleCollapse" class="p-1 rounded hover:bg-gray-700 focus:outline-none">
        <svg v-if="collapsed" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 5l7 7-7 7M5 5l7 7-7 7"
          />
        </svg>
        <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
          />
        </svg>
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-4">
      <ul class="space-y-2">
        <li v-for="(item, idx) in menuItems" :key="idx">
          <!-- Item com submenu -->
          <div v-if="item.children">
            <button
              @click="toggleSubmenu(idx)"
              class="w-full flex items-center px-4 py-2 text-sm hover:bg-gray-800 transition-colors relative group"
              :class="{ 'justify-center': collapsed }"
            >
              <span class="inline-flex items-center">
                <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    :d="item.icon"
                  />
                </svg>
                <span v-if="!collapsed" class="flex-1 text-left">{{ item.title }}</span>
                <svg
                  v-if="!collapsed"
                  class="w-4 h-4 ml-auto transition-transform"
                  :class="{ 'rotate-180': openSubmenus.includes(idx) }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </span>
              <!-- Tooltip quando recolhido -->
              <span
                v-if="collapsed"
                class="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50"
              >
                {{ item.title }}
              </span>
            </button>
            <ul v-if="openSubmenus.includes(idx) && !collapsed" class="pl-11 mt-1 space-y-1">
              <li v-for="child in item.children" :key="child.title">
                <a
                  :href="child.link"
                  class="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors"
                >
                  <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      :d="child.icon"
                    />
                  </svg>
                  {{ child.title }}
                </a>
              </li>
            </ul>
          </div>

          <!-- Item sem submenu (link direto) -->
          <a
            v-else
            :href="item.link"
            class="flex items-center px-4 py-2 text-sm hover:bg-gray-800 transition-colors relative group"
            :class="{ 'justify-center': collapsed }"
          >
            <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                :d="item.icon"
              />
            </svg>
            <span v-if="!collapsed">{{ item.title }}</span>
            <!-- Tooltip -->
            <span
              v-if="collapsed"
              class="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50"
            >
              {{ item.title }}
            </span>
          </a>
        </li>
      </ul>
    </nav>

    <!-- Footer / User info (opcional) -->
    <div class="p-4 border-t border-gray-700" :class="{ 'text-center': collapsed }">
      <div class="flex items-center" :class="{ 'justify-center': collapsed }">
        <div
          class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold"
        >
          U
        </div>
        <div v-if="!collapsed" class="ml-3">
          <p class="text-sm font-medium">Admin User</p>
          <p class="text-xs text-gray-400">admin@exemplo.pt</p>
        </div>
      </div>
    </div>
  </aside>
</template>
