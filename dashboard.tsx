import React, { useState, useEffect } from 'react';
import './dashboard.css';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
  assignedTo: string;
}

interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
}

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    inProgressTasks: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch user data
      const userResponse = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user data');
      }
      
      const userData = await userResponse.json();
      setUser(userData);

      // Fetch tasks data
      const tasksResponse = await fetch('/api/tasks', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!tasksResponse.ok) {
        throw new Error('Failed to fetch tasks data');
      }
      
      const tasksData = await tasksResponse.json();
      setTasks(tasksData);

      // Calculate stats
      const totalTasks = tasksData.length;
      const completedTasks = tasksData.filter((task: Task) => task.status === 'completed').length;
      const pendingTasks = tasksData.filter((task: Task) => task.status === 'pending').length;
      const inProgressTasks = tasksData.filter((task: Task) => task.status === 'in-progress').length;

      setStats({
        totalTasks,
        completedTasks,
        pendingTasks,
        inProgressTasks
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleTaskStatusUpdate = async (taskId: string, newStatus: Task['status']) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      // Refresh dashboard data
      fetchDashboardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return '#22c55e';
      case 'in-progress':
        return '#f59e0b';
      case 'pending':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error-message">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={fetchDashboardData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Auto-Task AI Dashboard</h1>
          {user && (
            <div className="user-info">
              <span>Welcome back, {user.name}!</span>
              <div className="user-avatar">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="dashboard-main">
        <section className="stats-section">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon total">📊</div>
              <div className="stat-content">
                <h3>Total Tasks</h3>
                <p className="stat-number">{stats.totalTasks}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon completed">✅</div>
              <div className="stat-content">
                <h3>Completed</h3>
                <p className="stat-number">{stats.completedTasks}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon in-progress">⏳</div>
              <div className="stat-content">
                <h3>In Progress</h3>
                <p className="stat-number">{stats.inProgressTasks}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon pending">⏰</div>
              <div className="stat-content">
                <h3>Pending</h3>
                <p className="stat-number">{stats.pendingTasks}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="tasks-section">
          <div className="section-header">
            <h2>Recent Tasks</h2>
            <button className="create-task-btn">
              + Create New Task
            </button>
          </div>
          
          <div className="tasks-list">
            {tasks.length === 0 ? (
              <div className="empty-state">
                <h3>No tasks found</h3>
                <p>Create your first task to get started with Auto-Task AI</p>
              </div>
            ) : (
              tasks.slice(0, 10).map((task) => (
                <div key={task.id} className="task-card">
                  <div className="task-main">
                    <div className="task-info">
                      <h4 className="task-title">{task.title}</h4>
                      <p className="task-description">{task.description}</p>
                      <span className="task-date">
                        Created: {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="task-status">
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(task.status) }}
                      >
                        {task.status.charAt(0).toUpperCase() + task.status.slice(1).replace('-', ' ')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="task-actions">
                    {task.status !== 'completed' && (
                      <>
                        {task.status === 'pending' && (
                          <button
                            onClick={() => handleTaskStatusUpdate(task.id, 'in-progress')}
                            className="action-btn start-btn"
                          >
                            Start
                          </button>
                        )}
                        
                        {task.status === 'in-progress' && (
                          <button
                            onClick={() => handleTaskStatusUpdate(task.id, 'completed')}
                            className="action-btn complete-btn"
                          >
                            Complete
                          </button>
                        )}
                      </>
                    )}
                    
                    <button className="action-btn edit-btn">
                      Edit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="quick-actions">
          <h2>Quick Actions</h2>
          <div className="actions-grid">
            <button className="action-card">
              <div className="action-icon">🤖</div>
              <div className="action-content">
                <h3>AI Assistant</h3>
                <p>Get help with task automation</p>
              </div>
            </button>
            
            <button className="action-card">
              <div className="action-icon">📈</div>
              <div className="action-content">
                <h3>Analytics</h3>
                <p>View detailed reports</p>
              </div>
            </button>
            
            <button className="action-card">
              <div className="action-icon">⚙️</div>
              <div className="action-content">
                <h3>Settings</h3>
                <p>Configure your workspace</p>
              </div>
            </button>
            
            <button className="action-card">
              <div className="action-icon">👥</div>
              <div className="action-content">
                <h3>Team</h3>
                <p>Manage team members</p>
              </div>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;