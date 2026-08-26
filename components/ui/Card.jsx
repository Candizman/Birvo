import styles from './primitives.module.css';

export default function Card({ as: Component = 'section', className = '', children, ...props }) {
  return <Component className={`${styles.card} ${className}`.trim()} {...props}>{children}</Component>;
}
