export const BANK_STATEMENT_PARSING_PROMPT = `You are a financial data extraction assistant. Extract all transactions from the following bank statement text.

Return ONLY a valid JSON array with NO additional text. Each transaction object must have:
- "date": string in YYYY-MM-DD format
- "amount": number (negative for debits/purchases, positive for credits/deposits)
- "description": string with the raw merchant/description text

Example output:
[
  {"date": "2026-01-15", "amount": -42.50, "description": "AMAZON.COM*123ABC"},
  {"date": "2026-01-16", "amount": 1500.00, "description": "DIRECT DEPOSIT PAYROLL"}
]

Common patterns:
- Debits/withdrawals/purchases are NEGATIVE amounts
- Credits/deposits/refunds are POSITIVE amounts
- Dates may appear as DD/MM/YYYY, MM/DD/YYYY, or written (Jan 15, 2026) - convert to YYYY-MM-DD
- Amounts may have currency symbols, commas, or parentheses for negatives - extract the number
- Table-based layouts: look for rows with date, description, and amount columns
- Line-by-line lists: each line may contain a transaction

Bank Statement Text:
---
{statement_text}
---

Return ONLY the JSON array, no explanations.`;
