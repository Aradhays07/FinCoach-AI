import { useState } from 'react';
import s from './UI.module.css';

export function Input({ label, error, hint, icon: Icon, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`${s.field} ${focused ? s.focused : ''} ${error ? s.hasError : ''}`}>
      {label && <label className={s.label}>{label}</label>}
      <div className={s.inputWrap}>
        {Icon && <Icon size={15} className={s.icon} />}
        <input className={`${s.input} ${Icon ? s.withIcon : ''}`}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...props} />
      </div>
      {error && <span className={s.error}>{error}</span>}
      {hint && !error && <span className={s.hint}>{hint}</span>}
    </div>
  );
}

export function Button({ children, variant = 'primary', size = 'md', loading, full, className = '', ...props }) {
  return (
    <button className={`${s.btn} ${s[variant]} ${s['sz-' + size]} ${loading ? s.loading : ''} ${full ? s.full : ''} ${className}`}
      disabled={loading || props.disabled} {...props}>
      {loading ? <span className={s.spinner} /> : children}
    </button>
  );
}

export function Card({ children, className = '', variant = 'default', ...props }) {
  return <div className={`${s.card} ${s['card-' + variant]} ${className}`} {...props}>{children}</div>;
}

export function Badge({ children, variant = 'default', dot }) {
  return (
    <span className={`${s.badge} ${s['b-' + variant]}`}>
      {dot && <span className={s.dot} />}{children}
    </span>
  );
}

export function Stat({ label, value, change, icon: Icon, accent }) {
  const validChange = change != null && !isNaN(Number(change));
  const pos = Number(change) >= 0;
  return (
    <div className={`${s.stat} ${accent ? s.statAccent : ''}`}>
      <div className={s.statTop}>
        <span className={s.statLabel}>{label}</span>
        {Icon && <div className={s.statIcon}><Icon size={16} /></div>}
      </div>
      <div className={s.statValue}>{value}</div>
      <div className={`${s.statChange} ${validChange ? (pos ? s.pos : s.neg) : ''}`}>
        {validChange
          ? <><span>{pos ? '↑' : '↓'} {Math.abs(Number(change))}%</span><span className={s.statPeriod}>vs last month</span></>
          : <span className={s.statPeriod}>vs last month</span>
        }
      </div>
    </div>
  );
}

export function Tag({ children, color = 'gray' }) {
  return <span className={`${s.tag} ${s['tag-' + color]}`}>{children}</span>;
}

export function Divider({ label }) {
  return (
    <div className={s.divider}>
      {label && <span className={s.dividerLabel}>{label}</span>}
    </div>
  );
}

export function Toast({ message, type = 'success', onClose }) {
  return (
    <div className={`${s.toast} ${s['toast-' + type]}`}>
      <span>{message}</span>
      <button onClick={onClose} className={s.toastClose}>×</button>
    </div>
  );
}
