/**
 * Cron scheduler for time-based automations
 * Uses node-cron for in-memory scheduling with dynamic registration
 */

import cron, { ScheduledTask } from 'node-cron';
import type { Automation } from '../types.js';
import { isCronSource } from '../types.js';
import { loadAllAutomations } from '../storage/kv.js';
import { execute } from '../engine/executor.js';

// Store scheduled tasks for cleanup/re-registration
const scheduledTasks: Map<string, ScheduledTask> = new Map();

/**
 * Register a single cron automation
 */
function registerCronJob(automation: Automation): boolean {
  if (!isCronSource(automation.source)) {
    return false;
  }

  const schedule = automation.source.schedule;

  // Validate cron expression
  if (!cron.validate(schedule)) {
    console.error(`[${automation.id}] Invalid cron schedule: ${schedule}`);
    return false;
  }

  // Stop existing task if re-registering
  const existingTask = scheduledTasks.get(automation.id);
  if (existingTask) {
    existingTask.stop();
    scheduledTasks.delete(automation.id);
  }

  // Create new scheduled task
  const task = cron.schedule(schedule, async () => {
    console.log(`[${automation.id}] Cron triggered: ${schedule}`);
    try {
      const result = await execute(automation);
      if (!result.success) {
        console.error(`[${automation.id}] Cron execution failed: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${automation.id}] Cron execution error: ${message}`);
    }
  });

  scheduledTasks.set(automation.id, task);
  console.log(`[${automation.id}] Cron job registered: ${schedule}`);

  return true;
}

/**
 * Stop and remove a scheduled cron job
 */
export function unregisterCronJob(automationId: string): boolean {
  const task = scheduledTasks.get(automationId);
  if (task) {
    task.stop();
    scheduledTasks.delete(automationId);
    console.log(`[${automationId}] Cron job unregistered`);
    return true;
  }
  return false;
}

/**
 * Stop all scheduled cron jobs
 */
export function stopAllCronJobs(): void {
  for (const [id, task] of scheduledTasks) {
    task.stop();
    console.log(`[${id}] Cron job stopped`);
  }
  scheduledTasks.clear();
}

/**
 * Get list of active cron job IDs
 */
export function getActiveCronJobs(): string[] {
  return Array.from(scheduledTasks.keys());
}

/**
 * Load all automations from storage and register cron jobs
 * Called on startup and when automations are updated
 */
export async function syncCronJobs(): Promise<{ registered: number; failed: number }> {
  console.log('Syncing cron jobs from storage...');

  let automations: Automation[];
  try {
    automations = await loadAllAutomations();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load automations for cron sync: ${message}`);
    return { registered: 0, failed: 0 };
  }

  // Get IDs of current cron automations
  const cronAutomations = automations.filter((a) => isCronSource(a.source));
  const cronIds = new Set(cronAutomations.map((a) => a.id));

  // Stop jobs that no longer exist
  for (const id of scheduledTasks.keys()) {
    if (!cronIds.has(id)) {
      unregisterCronJob(id);
    }
  }

  // Register or update cron jobs
  let registered = 0;
  let failed = 0;

  for (const automation of cronAutomations) {
    if (registerCronJob(automation)) {
      registered++;
    } else {
      failed++;
    }
  }

  console.log(`Cron sync complete: ${registered} registered, ${failed} failed`);
  return { registered, failed };
}

/**
 * Initialize cron scheduler on startup
 */
export async function initCronScheduler(): Promise<void> {
  console.log('Initializing cron scheduler...');
  await syncCronJobs();
}
