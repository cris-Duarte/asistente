import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Stop, RotateCcw, Plus, Flag, Clock, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { formatDuration } from '@/lib/utils';

const mockTasks = [
  { id: '1', title: 'Revisar PR #247', project: 'Frontend', estimated: 7200 },
  { id: '2', title: 'Escribir documentación API', project: 'Backend', estimated: 10800 },
  { id: '3', title: 'Refactor auth module', project: 'Backend', estimated: 14400 },
];

export function Timer() {
  const [selectedTask, setSelectedTask] = useState(mockTasks[0]);
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showTaskSelector, setShowTaskSelector] = useState(false);
  const intervalRef = useRef<number>();

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const startTimer = () => setIsRunning(true);
  const pauseTimer = () => setIsRunning(false);
  const resetTimer = () => {
    setIsRunning(false);
    setTime(0);
  };

  const progress = selectedTask.estimated > 0 ? Math.min((time / selectedTask.estimated) * 100, 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Timer</h1>
        <p className="text-gray-500 dark:text-gray-400">Registra tu tiempo de trabajo con precisión.</p>
      </div>

      <Card className="p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tarea actual</label>
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => setShowTaskSelector(true)}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-gray-100">{selectedTask.title}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedTask.project}</p>
              </div>
            </div>
            <RotateCcw className="h-5 w-5 text-gray-400" />
          </Button>
        </div>

        <div className="relative mb-8">
          <svg className="w-64 h-64 mx-auto transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
              className="dark:stroke-gray-700"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${progress * 2.83} ${283 - progress * 2.83}`}
              strokeDashoffset="0"
              className="transition-all duration-300"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 50 50"
                to="360 50 50"
                dur="60s"
                repeatCount="indefinite"
              />
            </circle>
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-5xl font-mono font-bold text-gray-900 dark:text-gray-100">{formatDuration(time)}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {selectedTask.estimated > 0 ? `de ${formatDuration(selectedTask.estimated)}` : 'Sin límite'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4">
          {isRunning ? (
            <Button variant="secondary" size="lg" onClick={pauseTimer} className="w-20">
              <Pause className="h-6 w-6" />
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={startTimer} className="w-20">
              <Play className="h-6 w-6" />
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={resetTimer} className="w-20">
            <Stop className="h-6 w-6" />
          </Button>
        </div>

        <div className="mt-6 h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
          <div
            className="h-full bg-primary-600 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
          {progress >= 100 ? '¡Tiempo estimado completado!' : `${Math.round(progress)}% del tiempo estimado`}
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Sesiones de hoy</h2>
        <div className="space-y-2">
          {[
            { task: 'Revisar PR #247', duration: '1h 30m', time: '09:15 - 10:45' },
            { task: 'Daily standup', duration: '15m', time: '10:45 - 11:00' },
            { task: 'Refactor auth module', duration: '2h 15m', time: '11:00 - 13:15' },
          ].map((session, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{session.task}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{session.time}</p>
                </div>
              </div>
              <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{session.duration}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}