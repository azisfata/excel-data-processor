import React, { useState, useMemo } from 'react';
import { Activity } from '../../../types';

interface ActivityCalendarPanelProps {
  activities: Activity[];
  formatActivityDate: (date?: string) => string;
  onActivityClick: (activity: Activity) => void;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  activities: Activity[];
  isToday: boolean;
}

const ActivityCalendarPanel: React.FC<ActivityCalendarPanelProps> = ({
  activities,
  formatActivityDate,
  onActivityClick,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Get activities mapped by date for efficient lookup
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>();
    
    activities.forEach(activity => {
      if (activity.tanggal_pelaksanaan) {
        const date = new Date(activity.tanggal_pelaksanaan);
        if (!isNaN(date.getTime())) {
          const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
          if (!map.has(dateKey)) {
            map.set(dateKey, []);
          }
          map.get(dateKey)!.push(activity);
        }
      }
    });
    
    return map;
  }, [activities]);

  // Generate calendar days for current month view
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days: CalendarDay[] = [];
    const today = new Date();
    
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const dateKey = date.toISOString().split('T')[0];
      const dayActivities = activitiesByDate.get(dateKey) || [];
      
      days.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        activities: dayActivities,
        isToday: date.toDateString() === today.toDateString()
      });
    }
    
    return days;
  }, [currentDate, activitiesByDate]);

  // Navigation functions
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    setSelectedDate(null);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'rencana':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'komitmen':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'outstanding':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'terbayar':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Month and year display
  const monthYear = currentDate.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric'
  });

  // Get activities for selected date
  const selectedDateActivities = selectedDate 
    ? activitiesByDate.get(selectedDate.toISOString().split('T')[0]) || []
    : [];

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-800">Kalender Kegiatan</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Hari Ini
            </button>
            <div className="flex items-center space-x-1">
              <button
                onClick={previousMonth}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                title="Bulan sebelumnya"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="px-3 py-1 text-sm font-medium text-gray-700 min-w-[120px] text-center">
                {monthYear}
              </span>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                title="Bulan berikutnya"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {/* Day headers */}
          {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((day) => (
            <div key={day} className="bg-gray-50 p-2 text-center text-xs font-semibold text-gray-700">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {calendarDays.map((day, index) => (
            <div
              key={index}
              className={`bg-white p-2 min-h-[80px] cursor-pointer transition-colors ${
                !day.isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'hover:bg-blue-50'
              } ${day.isToday ? 'bg-blue-50' : ''} ${
                selectedDate && day.date.toDateString() === selectedDate.toDateString() 
                  ? 'ring-2 ring-blue-500' 
                  : ''
              }`}
              onClick={() => setSelectedDate(day.isCurrentMonth ? day.date : null)}
            >
              <div className="flex flex-col h-full">
                <div className={`text-sm font-medium mb-1 ${
                  day.isToday ? 'text-blue-600 font-bold' : ''
                }`}>
                  {day.date.getDate()}
                </div>
                
                {/* Activities indicator */}
                {day.activities.length > 0 && (
                  <div className="flex-1 space-y-1">
                    {day.activities.slice(0, 3).map((activity, actIndex) => (
                      <div
                        key={actIndex}
                        className={`text-xs px-1 py-0.5 rounded truncate border ${getStatusColor(activity.status)}`}
                        title={`${activity.nama} - ${activity.status}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onActivityClick(activity);
                        }}
                      >
                        {activity.nama.length > 15 
                          ? activity.nama.substring(0, 15) + '...' 
                          : activity.nama}
                      </div>
                    ))}
                    {day.activities.length > 3 && (
                      <div className="text-xs text-gray-500 italic">
                        +{day.activities.length - 3} lagi
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Selected Date Activities */}
        {selectedDate && selectedDateActivities.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-3">
              Kegiatan pada {selectedDate.toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </h3>
            <div className="space-y-2">
              {selectedDateActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between p-3 bg-white rounded border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
                  onClick={() => onActivityClick(activity)}
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{activity.nama}</div>
                    <div className="text-sm text-gray-500">
                      Total: {activity.allocations.reduce((sum, alloc) => sum + (alloc.jumlah || 0), 0).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs rounded-full border ${getStatusColor(activity.status)}`}>
                      {activity.status || 'Tanpa Status'}
                    </span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No activities for selected date */}
        {selectedDate && selectedDateActivities.length === 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-center">
            <p className="text-gray-500">
              Tidak ada kegiatan pada {selectedDate.toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs">
          <span className="font-medium text-gray-700">Status:</span>
          {['rencana', 'komitmen', 'outstanding', 'terbayar'].map((status) => (
            <div key={status} className="flex items-center space-x-1">
              <div className={`w-3 h-3 rounded-full border ${getStatusColor(status)}`}></div>
              <span className="text-gray-600 capitalize">{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActivityCalendarPanel;
