<template>
  <div class="activity-log-container">
    <div class="header">
      <h1>Activity Logs</h1>
      <div class="filters">
        <select v-model="filters.service" @change="fetchLogs">
          <option value="">All Services</option>
          <option value="BOOKING">Booking</option>
          <option value="SCHEDULE">Schedule</option>
          <option value="USER">User</option>
        </select>
        <button @click="fetchLogs" class="refresh-btn">Refresh</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else class="table-wrapper">
      <table class="log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Service</th>
            <th>Action</th>
            <th>User</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ formatDate(log.created_at) }}</td>
            <td>
              <span :class="['badge', log.service.toLowerCase()]">{{ log.service }}</span>
            </td>
            <td>{{ log.action }}</td>
            <td>{{ log.user_name || 'System' }}</td>
            <td>
              <pre class="details-pre">{{ JSON.stringify(log.details, null, 2) }}</pre>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div class="pagination">
        <button :disabled="page === 1" @click="prevPage">Prev</button>
        <span>Page {{ page }}</span>
        <button :disabled="logs.length < limit" @click="nextPage">Next</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import axios from 'axios';
import dayjs from 'dayjs';

const logs = ref([]);
const loading = ref(true);
const page = ref(1);
const limit = 20;
const filters = reactive({
  service: '',
});

const fetchLogs = async () => {
  loading.ref = true;
  try {
    const offset = (page.value - 1) * limit;
    const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/v1/activity-logs`, {
      params: {
        ...filters,
        limit,
        offset
      }
    });
    logs.value = response.data.data.logs;
  } catch (error) {
    console.error('Failed to fetch logs:', error);
  } finally {
    loading.value = false;
  }
};

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
};

const nextPage = () => {
  page.value++;
  fetchLogs();
};

const prevPage = () => {
  if (page.value > 1) {
    page.value--;
    fetchLogs();
  }
};

onMounted(fetchLogs);
</script>

<style scoped>
.activity-log-container {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.refresh-btn {
  padding: 8px 16px;
  background-color: #fca311;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  border-radius: 8px;
  overflow: hidden;
}

.log-table th, .log-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.log-table th {
  background-color: #14213d;
  color: white;
}

.details-pre {
  margin: 0;
  font-size: 12px;
  max-width: 400px;
  white-space: pre-wrap;
  word-break: break-all;
}

.badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
}

.badge.booking { background: #e3f2fd; color: #1976d2; }
.badge.schedule { background: #f1f8e9; color: #388e3c; }
.badge.user { background: #fff3e0; color: #f57c00; }

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 20px;
}
</style>
