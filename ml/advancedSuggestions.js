import Task from "../models/task.js";

export async function getAdvancedSuggestions(userId, tenantId) {
  const tasks = await Task.find({ userId, tenantId, isActive: true });
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  const suggestions = [];

  // 1. Due today but not yet executed
  for (const task of tasks) {
    let isDueToday = false;
    if (task.datetime) {
      const taskDateStr = new Date(task.datetime).toISOString().slice(0, 10);
      isDueToday = taskDateStr === todayStr;
    } else if (task.frequency === "daily") {
      isDueToday = true;
    } else if (task.frequency === "weekly" && task.weeklyDay) {
      const weekDays = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      isDueToday = weekDays[now.getDay()] === task.weeklyDay;
    }
    const ranToday = (task.executionHistory || []).some((e) => {
      const d = new Date(e.executedAt).toISOString().slice(0, 10);
      return d === todayStr;
    });
    if (isDueToday && !ranToday) {
      suggestions.push({
        type: "due-today",
        taskId: task._id,
        description: task.description,
        suggestedFor: now,
        reason: "This automation is scheduled for today but hasn't run yet.",
        confidence: 0.95,
        originalTask: task,
      });
    }
  }

  // 2. Missed in the last 3 days
  for (const task of tasks) {
    if (task.frequency === "daily") {
      let missed = false;
      let missedDays = [];
      for (let i = 1; i <= 3; i++) {
        const missedDate = new Date(now);
        missedDate.setDate(now.getDate() - i);
        const missedStr = missedDate.toISOString().slice(0, 10);
        const ran = (task.executionHistory || []).some((e) => {
          const d = new Date(e.executedAt).toISOString().slice(0, 10);
          return d === missedStr;
        });
        if (!ran) missedDays.push(missedStr);
      }
      if (missedDays.length > 0) {
        suggestions.push({
          type: "missed-recently",
          taskId: task._id,
          description: task.description,
          suggestedFor: now,
          reason: `This daily automation was missed on: ${missedDays.join(
            ", "
          )}`,
          confidence: 0.85,
          originalTask: task,
        });
      }
    }
  }

  // 3. Time-of-day recommendation
  for (const task of tasks) {
    // Find the most common hour for execution
    const hours = (task.executionHistory || []).map((e) =>
      new Date(e.executedAt).getHours()
    );
    if (hours.length > 2) {
      const hourCounts = hours.reduce((acc, h) => {
        acc[h] = (acc[h] || 0) + 1;
        return acc;
      }, {});
      const mostCommonHour = Object.keys(hourCounts).reduce((a, b) =>
        hourCounts[a] > hourCounts[b] ? a : b
      );
      if (parseInt(mostCommonHour) === hour) {
        // Not yet run this hour today
        const ranThisHourToday = (task.executionHistory || []).some((e) => {
          const d = new Date(e.executedAt);
          return (
            d.toISOString().slice(0, 10) === todayStr && d.getHours() === hour
          );
        });
        if (!ranThisHourToday) {
          suggestions.push({
            type: "time-of-day",
            taskId: task._id,
            description: task.description,
            suggestedFor: now,
            reason: `You usually run this automation around ${hour}:00.`,
            confidence: 0.8,
            originalTask: task,
          });
        }
      }
    }
  }

  // 4. Streaks: tasks with longest consecutive execution streaks
  for (const task of tasks) {
    const dates = (task.executionHistory || []).map((e) =>
      new Date(e.executedAt).toISOString().slice(0, 10)
    );
    let streak = 0;
    let prev = todayStr;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      if (dates.includes(dStr)) {
        streak++;
        prev = dStr;
      } else {
        break;
      }
    }
    if (streak >= 3) {
      suggestions.push({
        type: "streak",
        taskId: task._id,
        description: task.description,
        suggestedFor: now,
        reason: `You're on a ${streak}-day streak with this automation! Keep it going!`,
        confidence: 0.9,
        originalTask: task,
      });
    }
  }

  // 5. Contextual: missed for several days, suggest catch-up
  for (const task of tasks) {
    if (task.frequency === "daily") {
      let missedCount = 0;
      for (let i = 1; i <= 7; i++) {
        const missedDate = new Date(now);
        missedDate.setDate(now.getDate() - i);
        const missedStr = missedDate.toISOString().slice(0, 10);
        const ran = (task.executionHistory || []).some((e) => {
          const d = new Date(e.executedAt).toISOString().slice(0, 10);
          return d === missedStr;
        });
        if (!ran) missedCount++;
      }
      if (missedCount >= 5) {
        suggestions.push({
          type: "catch-up",
          taskId: task._id,
          description: task.description,
          suggestedFor: now,
          reason: `You've missed this automation ${missedCount} times in the last week. Want to catch up?`,
          confidence: 0.7,
          originalTask: task,
        });
      }
    }
  }

  // 6. Popular recurring task
  if (tasks.length > 0) {
    const taskRunCounts = tasks.map((task) => ({
      taskId: task._id,
      description: task.description,
      count: Array.isArray(task.executionHistory)
        ? task.executionHistory.length
        : 0,
      originalTask: task,
    }));
    const mostPopular = taskRunCounts.sort((a, b) => b.count - a.count)[0];
    if (mostPopular && mostPopular.count > 2) {
      suggestions.push({
        type: "popular",
        taskId: mostPopular.taskId,
        description: mostPopular.description,
        suggestedFor: now,
        reason: "This is your most frequently automated task.",
        confidence: 0.88,
        originalTask: mostPopular.originalTask,
      });
    }
  }

  // 7. Try something new (if user has < 3 automations)
  if (tasks.length < 3) {
    suggestions.push({
      type: "try-new",
      description: "Try creating a new automation to boost your productivity!",
      suggestedFor: now,
      reason: "You have only a few automations. Explore more possibilities!",
      confidence: 0.6,
    });
  }

  // Shuffle and limit to 1 suggestion per day
  suggestions.sort(() => Math.random() - 0.5);
  return suggestions.slice(0, 1);
}
