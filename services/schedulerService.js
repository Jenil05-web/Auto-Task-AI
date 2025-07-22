import cron from "node-cron";
import CallTask from "../models/CallTask.js";
import CallService from "./callService.js";
import * as aiConversationService from "./aiConversationService.js";

class SchedulerService {
  constructor() {
    this.scheduledTasks = new Map();
    this.initializeScheduler();
  }

  async initializeScheduler() {
    // Load existing active tasks and schedule them
    const activeTasks = await CallTask.find({ isActive: true });
    activeTasks.forEach((task) => this.scheduleTask(task));
  }

  scheduleTask(callTask) {
    const cronExpression = this.convertToCronExpression(callTask.schedule);

    const scheduledTask = cron.schedule(
      cronExpression,
      async () => {
        await this.executeCallTask(callTask._id);
      },
      {
        scheduled: true,
        timezone: callTask.schedule.timezone,
      }
    );

    this.scheduledTasks.set(callTask._id.toString(), scheduledTask);
  }

  convertToCronExpression(schedule) {
    const [hour, minute] = schedule.time.split(":");

    switch (schedule.frequency) {
      case "daily":
        return `${minute} ${hour} * * *`;
      case "weekly":
        const days = schedule.daysOfWeek.join(",");
        return `${minute} ${hour} * * ${days}`;
      case "monthly":
        return `${minute} ${hour} 1 * *`;
      default:
        return `${minute} ${hour} * * *`;
    }
  }

  async executeCallTask(taskId) {
    try {
      const task = await CallTask.findById(taskId)
        .populate("userId")
        .populate("clients");

      if (!task || !task.isActive) return;

      // Execute calls for all clients in the task
      const callPromises = task.clients.map(async (client) => {
        const callResult = await CallService.initiateCall(
          client.phone,
          task.callScript,
          taskId
        );
        // Start AI-led conversation (after call is initiated)
        await aiConversationService.startConversation({
          userId: task.userId._id,
          clientId: client._id,
          callTaskId: task._id,
          callSid: callResult.callSid,
          clientInfo: client,
          callScript: task.callScript,
        });
        return callResult;
      });

      await Promise.all(callPromises);

      // Update next execution time
      task.nextExecutionTime = this.calculateNextExecution(task.schedule);
      await task.save();
    } catch (error) {
      console.error(`Task execution failed for ${taskId}:`, error);
    }
  }

  calculateNextExecution(schedule) {
    // Calculate next execution time based on frequency
    const now = new Date();
    const [hour, minute] = schedule.time.split(":");

    const next = new Date(now);
    next.setHours(parseInt(hour), parseInt(minute), 0, 0);

    if (next <= now) {
      switch (schedule.frequency) {
        case "daily":
          next.setDate(next.getDate() + 1);
          break;
        case "weekly":
          next.setDate(next.getDate() + 7);
          break;
        case "monthly":
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }

    return next;
  }

  stopTask(taskId) {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      scheduledTask.stop();
      this.scheduledTasks.delete(taskId);
    }
  }
}

const schedulerService = new SchedulerService();
export default schedulerService;
