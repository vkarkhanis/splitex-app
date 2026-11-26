'use client';

import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { Button, Field, Label, useToast } from '@traxettle/ui';
import { getResolvedApiBaseUrl } from '../../config/dev-options';
import { MAX_RECEIPT_BYTES, poolApi, RECEIPT_ACCEPT } from '../../utils/pool-api';
import { toPoolError } from './poolFormat';

const Files = styled.ul`
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
`;

const Chip = styled.li`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid ${(p) => p.theme.colors.border};
  a { color: ${(p) => p.theme.colors.primary}; }
  button { border: none; background: none; cursor: pointer; color: ${(p) => p.theme.colors.muted}; }
`;

const Hint = styled.div<{ $error?: boolean }>`
  font-size: 12px;
  color: ${(p) => (p.$error ? p.theme.colors.error : p.theme.colors.muted)};
`;

function href(url: string) {
  if (/^https?:\/\//i.test(url) || !url.startsWith('/')) return url;
  return `${getResolvedApiBaseUrl().replace(/\/$/, '')}${url}`;
}

interface Props {
  eventId: string;
  value: string[];
  onChange: (urls: string[]) => void;
  required?: boolean;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

/** Attach receipts (photos or PDF bills) to any expense. */
export function ReceiptField({ eventId, value, onChange, required, disabled, onUploadingChange }: Props) {
  const { push: pushToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const setBusy = (b: boolean) => { setUploading(b); onUploadingChange?.(b); };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_RECEIPT_BYTES) {
          pushToast({ type: 'error', title: 'File too large', message: `${file.name} is over 5MB.` });
          continue;
        }
        added.push(await poolApi.uploadReceipt(eventId, file));
      }
      if (added.length) onChange([...value, ...added]);
    } catch (err) {
      pushToast({ type: 'error', title: 'Upload failed', message: toPoolError(err, 'Could not upload the receipt').message });
      if (added.length) onChange([...value, ...added]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Field data-testid="receipt-field">
      <Label htmlFor="expense-receipts">Receipts{required ? '' : ' (optional)'}</Label>
      <div>
        <input ref={input} id="expense-receipts" type="file" accept={RECEIPT_ACCEPT} multiple hidden
          onChange={(e) => void onFiles(e.target.files)} data-testid="receipt-input" />
        <Button type="button" $variant="outline" $size="sm" disabled={disabled || uploading} onClick={() => input.current?.click()}>
          {uploading ? 'Uploading…' : value.length ? 'Add another' : 'Attach receipt'}
        </Button>
      </div>
      {value.length > 0 && (
        <Files>
          {value.map((url, i) => (
            <Chip key={url}>
              <a href={href(url)} target="_blank" rel="noreferrer">Receipt {i + 1}</a>
              <button type="button" aria-label={`Remove receipt ${i + 1}`} disabled={disabled}
                onClick={() => onChange(value.filter((u) => u !== url))}>✕</button>
            </Chip>
          ))}
        </Files>
      )}
      {required && value.length === 0 && <Hint $error>A receipt is required for this expense.</Hint>}
      {!required && <Hint>Photos or PDF bills, up to 5MB each.</Hint>}
    </Field>
  );
}
