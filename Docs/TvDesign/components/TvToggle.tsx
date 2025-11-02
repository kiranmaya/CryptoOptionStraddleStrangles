import React from 'react';
import styles from './TvToggle.module.css';

const cx = (...classes: Array<string | false | null | undefined>) =>
	classes.filter(Boolean).join(' ');

export interface TvToggleProps
	extends Omit<
		React.InputHTMLAttributes<HTMLInputElement>,
		'type' | 'onChange' | 'className'
	> {
	id?: string;
	label?: React.ReactNode;
	checked: boolean;
	onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	className?: string;
	labelClassName?: string;
}

export function TvToggle({
	id,
	label,
	checked,
	onChange,
	className,
	labelClassName,
	...rest
}: TvToggleProps) {
	const fallbackId = React.useId();
	const inputId = id ?? fallbackId;

	return (
		<label className={cx(styles.toggle, className)} htmlFor={inputId}>
			<input
				{...rest}
				id={inputId}
				type="checkbox"
				className={styles.input}
				checked={checked}
				onChange={onChange}
			/>
			<span className={styles.control} aria-hidden="true">
				<span className={styles.thumb} />
			</span>
			{label && (
				<span className={cx(styles.label, labelClassName)}>{label}</span>
			)}
		</label>
	);
}
