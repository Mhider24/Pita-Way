-- Run against the source database as a read-only user.
-- Optional dates use the store's calendar. The end date is exclusive.
DECLARE @start_date date = NULL;
DECLARE @end_date date = NULL;

SELECT
    'clarkston' AS store_id,
    CONVERT(char(10), [date], 23) AS local_date,
    [hour] AS local_hour,
    net_sales AS sales_usd,
    orders AS order_count,
    COUNT_BIG(*) OVER () AS export_row_count
FROM hourly
WHERE store = 'clarkston'
    AND (@start_date IS NULL OR [date] >= @start_date)
    AND (@end_date IS NULL OR [date] < @end_date)
ORDER BY [date], [hour];
