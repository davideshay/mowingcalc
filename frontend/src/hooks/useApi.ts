import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

const API_BASE = '/api';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function useApi<T>(url: string, options?: RequestInit): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const json = await response.json();
      setData(json);
      return json;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [url, JSON.stringify(options)]);

  useEffect(() => {
    fetcher();
  }, [fetcher]);

  return { data, loading, error, refetch: fetcher };
}

// Polling hook for real-time updates
function usePolling<T>(url: string, intervalMs: number = 30000): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetcher();
    const interval = setInterval(fetcher, intervalMs);
    return () => clearInterval(interval);
  }, [fetcher, intervalMs]);

  return { data, loading, error, refetch: fetcher };
}

// Config hooks
export function useConfig() {
  return useApi<any>('/config');
}

export function useAlgorithmState() {
  return usePolling<import('../types/api').AlgorithmStateResponse>('/algorithm-state', 30000);
}

export function useMowerStatus() {
  return usePolling<import('../types/api').MowerStatusResponse>('/mow/status', 10000);
}

export function useMowEvents() {
  return useApi<import('../types/api').MowEvent[]>('/mow/events');
}

export function useAlgorithmHistory() {
  return useApi<import('../types/api').AlgorithmRun[]>('/algorithm/history');
}

export function useGrowthHistory() {
  return useApi<import('../types/api').GrowthHistoryPoint[]>('/growth-history');
}

// Config update hook
export function useConfigUpdate() {
  const [saving, setSaving] = useState(false);

  const updateConfig = useCallback(async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      toast.success('Configuration saved');
      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      toast.error(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const fullSaveConfig = useCallback(async (config: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      toast.success('Configuration saved');
      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      toast.error(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { updateConfig, fullSaveConfig, saving };
}

// Mower control hook
export function useMowerControl() {
  const [triggering, setTriggering] = useState(false);

  const startMow = useCallback(async () => {
    setTriggering(true);
    try {
      const response = await fetch(`${API_BASE}/mow/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      toast.success('Mower started');
      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start mower';
      toast.error(message);
      throw err;
    } finally {
      setTriggering(false);
    }
  }, []);

  return { startMow, triggering };
}

export { useApi, usePolling };
