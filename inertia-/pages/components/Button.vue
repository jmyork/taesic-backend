<script setup lang="ts">
defineProps<{
  type?: 'button' | 'submit' | 'reset'
  variant?: 'primary' | 'secondary' | 'link'
  disabled?: boolean
}>()
</script>

<template>
  <button
    :type="type || 'button'"
    :disabled="disabled"
    class="inline-flex justify-center items-center px-4 py-2 border font-medium rounded-md shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    :class="{
      'border-transparent text-white bg-[#4A8BDF] hover:bg-[#3a6eb0] focus:ring-[#4A8BDF]':
        variant === 'primary' || !variant,
      'border-gray-300 text-neutral-700 bg-white hover:bg-gray-50 focus:ring-[#4A8BDF]':
        variant === 'secondary',
      'border-transparent text-[#A0006D] bg-transparent hover:text-[#7f0057] focus:ring-[#A0006D] shadow-none':
        variant === 'link',
    }"
  >
    <slot />
  </button>
</template>
