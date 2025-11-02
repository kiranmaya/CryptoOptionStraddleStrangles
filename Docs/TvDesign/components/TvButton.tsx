import React from 'react';
import styles from './TvButton.module.css';

const cx = (...classes: Array<string | false | null | undefined>) =>
	classes.filter(Boolean).join(' ');

export type ButtonVariant = 'primary' | 'success' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
	primary: styles.primary,
	success: styles.success,
	danger: styles.danger,
	ghost: styles.ghost,
};

const SIZE_CLASS: Record<ButtonSize, string | undefined> = {
	sm: styles.sizeSm,
	md: undefined,
	lg: styles.sizeLg,
};

export interface TvButtonBaseProps {
	variant?: ButtonVariant;
	size?: ButtonSize;
	icon?: React.ReactNode;
	className?: string;
	children?: React.ReactNode;
	disabled?: boolean;
}

export type TvButtonButtonProps = TvButtonBaseProps &
	React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

export type TvButtonAnchorProps = TvButtonBaseProps &
	React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		href: string;
	};

export type TvButtonProps = TvButtonButtonProps | TvButtonAnchorProps;

export function TvButton(props: TvButtonProps) {
	const {
		variant = 'primary',
		size = 'md',
		icon,
		className,
		children,
		disabled,
	} = props;

	const variantClass = VARIANT_CLASS[variant];
	const sizeClass = SIZE_CLASS[size];
	const isIconOnly = Boolean(icon) && !children;

	const composedClassName = cx(
		styles.button,
		variantClass,
		sizeClass,
		isIconOnly && styles.iconOnly,
		className
	);

	if ('href' in props) {
		const {
			href,
			onClick,
			target,
			rel,
			variant: _variant,
			size: _size,
			icon: _icon,
			className: _className,
			children: _children,
			disabled: _disabled,
			...anchorRest
		} = props as TvButtonAnchorProps;

		return (
			<a
				{...anchorRest}
				className={composedClassName}
				href={disabled ? undefined : href}
				target={target}
				rel={rel}
				aria-disabled={disabled || undefined}
				onClick={(event) => {
					if (disabled) {
						event.preventDefault();
						return;
					}
					onClick?.(event);
				}}
			>
				{icon && <span aria-hidden="true">{icon}</span>}
				{children}
			</a>
		);
	}

	const {
		type,
		variant: _variant,
		size: _size,
		icon: _icon,
		className: _className,
		children: _children,
		disabled: _disabled,
		...buttonRest
	} = props as TvButtonButtonProps;

	return (
		<button
			{...buttonRest}
			className={composedClassName}
			type={type ?? 'button'}
			disabled={disabled}
		>
			{icon && <span aria-hidden="true">{icon}</span>}
			{children}
		</button>
	);
}
