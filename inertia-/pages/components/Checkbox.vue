<script setup>
defineProps({
  modelValue: Boolean,
  label: String,
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="flex items-center">
    <input
      type="checkbox"
      :checked="modelValue"
      value
      @change="$emit('update:modelValue', $event.target.checked)"
      class="h-4 w-4 text-[#4A8BDF] focus:ring-[#4A8BDF] border-gray-300 rounded"
    />
    <label v-if="label" class="ml-2 block text-sm text-gray-900">
      {{ label }}
    </label>
  </div>
</template>
