<template>
	<div class="p-4 space-y-4">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-bold">服务器状态</h2>
			<div class="flex items-center gap-2">
				<UButton :loading="loading" icon="i-heroicons-arrow-path" @click="fetchData">刷新</UButton>
				<span class="text-sm text-gray-500">上次刷新：{{ lastRefreshedText }}</span>
			</div>
		</div>

	<!-- 统计卡片 -->
	<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
		<UCard>
			<div class="text-center">
				<div class="text-3xl font-bold text-blue-600 mb-1">{{ totalStats.totalOnline }}</div>
				<div class="text-sm text-gray-600">全服在线总数</div>
			</div>
		</UCard>
		<UCard>
			<div class="text-center">
				<div class="text-3xl font-bold text-green-600 mb-1">{{ totalStats.totalAndroid }}</div>
				<div class="text-sm text-gray-600">Android在线</div>
			</div>
		</UCard>
		<UCard>
			<div class="text-center">
				<div class="text-3xl font-bold text-orange-600 mb-1">{{ totalStats.totalIOS }}</div>
				<div class="text-sm text-gray-600">iOS在线</div>
			</div>
		</UCard>
		<UCard>
			<div class="text-center">
				<div class="text-3xl font-bold text-purple-600 mb-1">{{ totalStats.totalRegister }}</div>
				<div class="text-sm text-gray-600">全服注册总数</div>
			</div>
		</UCard>
	</div>

		<UTable :rows="rows" :columns="columns" :loading="loading">
			<template #name-data="{ row }">
				<div class="flex items-center gap-2">
					<UIcon name="i-heroicons-server" class="w-4 h-4 text-gray-500" />
					<span>{{ row.name || row.svrName || '-' }}</span>
				</div>
			</template>
			<template #webhost-data="{ row }">
				<a :href="row.webhost" target="_blank" class="text-primary-500 hover:underline">{{ row.webhost }}</a>
			</template>
		<template #register-data="{ row }">
			<span class="font-medium">{{ row.register }}</span>
		</template>
		<template #online-data="{ row }">
			<span class="font-medium text-blue-600">{{ row.online || 0 }}</span>
		</template>
		<template #onlineAndroid-data="{ row }">
			<span class="font-medium text-green-600">{{ row.onlineAndroid || 0 }}</span>
		</template>
		<template #onlineIOS-data="{ row }">
			<span class="font-medium text-orange-600">{{ row.onlineIOS || 0 }}</span>
		</template>
		<template #status-data="{ row }">
			<UBadge :color="row.error ? 'red' : 'green'">{{ row.error ? '异常' : '正常' }}</UBadge>
		</template>
		</UTable>
	</div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '~/store/auth'

const router = useRouter()
const auth = useAuthStore()

// 仅管理员可见
if (process.client) {
	if (!auth.isLoggedIn || auth.isUser) {
		router.replace('/admin/login')
	}
}

const loading = ref(false)
const rows = ref([])
const lastRefreshed = ref(null)

const columns = [
	{ key: 'id', label: 'ID', sortable: true },
	{ key: 'name', label: '名称' },
	{ key: 'webhost', label: '地址' },
	{ key: 'areaId', label: '区服ID' },
	{ key: 'register', label: '注册数' },
	{ key: 'online', label: '在线总数' },
	{ key: 'onlineAndroid', label: 'Android在线' },
	{ key: 'onlineIOS', label: 'iOS在线' },
	{ key: 'status', label: '状态' }
]

const lastRefreshedText = computed(() => {
	if (!lastRefreshed.value) return '—'
	const d = new Date(lastRefreshed.value)
	const pad = (n) => (n < 10 ? '0' + n : '' + n)
	return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

// 计算所有服务器的统计总数
const totalStats = computed(() => {
	return {
		totalOnline: rows.value.reduce((sum, row) => sum + (row.online || 0), 0),
		totalAndroid: rows.value.reduce((sum, row) => sum + (row.onlineAndroid || 0), 0),
		totalIOS: rows.value.reduce((sum, row) => sum + (row.onlineIOS || 0), 0),
		totalRegister: rows.value.reduce((sum, row) => sum + (row.register || 0), 0)
	}
})

async function fetchData() {
	loading.value = true
	try {
		const res = await $fetch('/api/admin/server-status', { method: 'GET' })
		rows.value = (res && res.data) ? res.data : []
		lastRefreshed.value = Date.now()
	} catch (e) {
		console.error(e)
	} finally {
		loading.value = false
	}
}

onMounted(() => {
	fetchData()
})
</script>

<style scoped>
.p-4 {
	padding: 1rem;
}
.space-y-4 > * + * {
	margin-top: 1rem;
}
</style>


