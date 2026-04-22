<template>
  <div class="modal-backdrop">
    <div class="modal">
      <header class="modal-header">
        <slot name="header"></slot>
        <div @click="handleClose" class="close-button">✖</div>
      </header>
      <div class="modal-body">
        <slot name="body"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineEmits } from 'vue';

const emit = defineEmits(['closeModal']);

const handleClose = () => {
  emit('closeModal');
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6); /* 更深的背景遮罩 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}

.modal {
  background: #fff;
  padding: 20px 30px;
  border-radius: 10px;
  width: 400px;
  max-width: 80%;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3); /* 添加阴影 */
  animation: fadeIn 0.3s ease-out; /* 添加淡入动画 */
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
  margin-bottom: 20px;
}

.close-button {
  cursor: pointer;
  font-size: 1.2rem;
  padding: 5px;
  border-radius: 50%;
  transition: background-color 0.3s ease;
}

.close-button:hover {
  background-color: var(--surface-container);
}

.modal-body {
  padding: 10px 0;
}

form div {
  margin-bottom: 15px;
}

form label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

form input, form select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  transition: border-color 0.3s ease;
}

form input:focus, form select:focus {
  border-color: var(--primary);
  outline: none;
}

form button {
  width: 100%;
  padding: 10px;
  background-color: var(--secondary-dim);
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.3s ease;
}

form button:hover {
  background-color: var(--secondary-dim);
}
</style>
