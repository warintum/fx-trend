export function formatPrice(price: number | string | null | undefined, decimals: number = 2): string {
    if (price === null || price === undefined || price === '' || price === 0) return '-';
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num as number) || num === null || num === 0) return '-';
    return (num as number).toFixed(decimals);
}

export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatPercentage(value: number): string {
    return `${value.toFixed(0)}%`;
}

export function formatPriceChange(current: number, previous: number): string {
    const change = current - previous;
    const percentChange = (change / previous) * 100;
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${percentChange.toFixed(2)}%)`;
}
