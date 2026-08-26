import React from 'react';
import styles from './weatherWidget.module.css';

export default function WeatherWidget({ weather }) {
  if (!weather?.available) return null;

  if (weather.isPlaceholder) {
    return (
      <div className={styles.widgetContainer}>
        <p className={styles.mutedText}>Configure a weather provider to display live course conditions.</p>
      </div>
    );
  }

  return (
    <div className={styles.widgetContainer}>
      <div className={styles.weatherData}>
        <span className={styles.temperature}>{weather.temperature}°</span>
        <span className={styles.conditions}>{weather.conditions}</span>
      </div>
    </div>
  );
}
