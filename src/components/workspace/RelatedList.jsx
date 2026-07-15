import React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';

// columns: [{ header:{ar,en}, cell:(row)=>node }]
export default function RelatedList({ columns, rows, emptyText }) {
  const { lang } = useStore();
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c, i) => <TableHead key={i}>{lang === 'ar' ? c.header.ar : c.header.en}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-10 text-muted-foreground">
                  {emptyText || t('لا توجد بيانات', 'No data', lang)}
                </TableCell>
              </TableRow>
            ) : rows.map((row, ri) => (
              <TableRow key={row.id || ri} className="hover:bg-muted/30">
                {columns.map((c, ci) => <TableCell key={ci}>{c.cell(row)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}