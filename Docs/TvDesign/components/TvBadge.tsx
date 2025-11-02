import React from 'react';
import styles from './TvBadge.module.css';

const cx = (...classes: Array<string | false | null | undefined>) =>
	classes.filter(Boolean).join(' ');

export type TvBadgeVariant = 'primary' | 'success' | 'danger' | 'neutral';

const VARIANT_CLASS: Record<TvBadgeVariant, string> = {
	primary: styles.primary,
	success: styles.success,
	danger: styles.danger,
	neutral: styles.neutral,
};

export interface TvBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: TvBadgeVariant;
	children?: React.ReactNode;
}

export function TvBadge({
	variant = 'neutral',
	children,
	className,
	...rest
}: TvBadgeProps) {
	return (
		<span
			className={cx(styles.badge, VARIANT_CLASS[variant], className)}
			{...rest}
		>
			{children}
		</span>
	);
}
