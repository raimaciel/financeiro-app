import React from 'react';
import { Input } from '@/components/ui/input';

interface CurrencyInputProps {
  id?: string;
  value: number | string;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  id,
  value,
  onChange,
  placeholder = '0,00',
  className = '',
  disabled = false,
}) => {
  const formatDisplay = (num: number): string => {
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const [displayValue, setDisplayValue] = React.useState<string>(() => {
    if (value === '' || value === undefined || value === null) return '';
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(num) || num === 0 ? '' : formatDisplay(num);
  });

  React.useEffect(() => {
    if (value === '' || value === undefined || value === null || value === 0) {
      setDisplayValue('');
    } else {
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (!isNaN(num)) {
        setDisplayValue(formatDisplay(num));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, '');

    if (!digitsOnly) {
      setDisplayValue('');
      onChange(0);
      return;
    }

    const numericValue = parseInt(digitsOnly, 10) / 100;
    setDisplayValue(formatDisplay(numericValue));
    onChange(numericValue);
  };

  return (
    <div className="relative flex items-center w-full">
      <span className="absolute left-3 text-slate-500 font-semibold text-xs pointer-events-none select-none">
        R$
      </span>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`pl-9 bg-white ${className}`}
      />
    </div>
  );
};
