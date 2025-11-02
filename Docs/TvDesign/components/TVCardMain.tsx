import React from 'react';
import styles from './TVCard.module.css';

const cx = (...classes: Array<string | false | null | undefined>) =>
	classes.filter(Boolean).join(' ');

export interface TVCardEmptyProps
	extends React.HTMLAttributes<HTMLDivElement> {
	padded?: boolean;
	mode?: 'dark' | 'light';
}

export function TVCardMain({
	children,
	className,
	padded = true,
	mode = 'dark',
	...rest
}: TVCardEmptyProps) {
	const cardClassName = cx(styles.card, styles.cardEmpty, className);
	const surfaceClassName = cx(styles.surface, styles.surfaceEmpty);
	const themeAttribute = mode === 'light' ? 'light' : undefined;
	const content = padded ? (
		<div className={styles.inner}>{children}</div>
	) : (
		children
	);

	return (
		<article
			data-tv-theme={themeAttribute}
			className={cardClassName}
			{...rest}
		>
			<div className={surfaceClassName}>{content}</div>
		</article>
	);
}
