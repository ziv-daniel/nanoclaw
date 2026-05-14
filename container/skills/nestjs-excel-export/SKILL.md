---
name: nestjs-excel-export
description: |
  Export data tables to Excel from NestJS using ExcelJS with proper streaming, headers, and buffer handling. Use when: (1) need to export database queries to .xlsx files, (2) building admin dashboards with export features, (3) generating reports for download, (4) implementing table export buttons in frontend, (5) need Excel with formatted columns and data. Covers ExcelJS setup, buffer streaming, HTTP response headers, frontend download integration, and large dataset handling.
author: Claude Code
version: 1.0.0
date: 2026-01-20
---

# NestJS Excel Export with ExcelJS

## Problem
Exporting data to Excel from NestJS requires proper buffer handling, correct HTTP headers, and frontend integration for file downloads. ExcelJS is the recommended lightweight library for generating .xlsx files in 2026.

## Context / Trigger Conditions
Use this skill when:
- Building admin dashboards with data export functionality
- Need to export database tables to Excel
- Users request downloadable reports
- Implementing "Export to Excel" buttons in frontend
- Working with large datasets (need streaming)
- Need formatted Excel files (columns, styling, formulas)
- Replacing CSV exports with proper Excel format

## Solution

### Step 1: Install ExcelJS

```bash
# Install ExcelJS
bun add exceljs

# TypeScript types (usually included)
bun add -d @types/exceljs
```

### Step 2: Create Excel Export Service

```typescript
// src/common/services/excel-export.service.ts
import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

@Injectable()
export class ExcelExportService {
  /**
   * Generate Excel buffer from data
   * @param data Array of objects to export
   * @param columns Column definitions
   * @param sheetName Worksheet name
   * @returns Buffer containing Excel file
   */
  async generateExcel<T extends Record<string, any>>(
    data: T[],
    columns: ExcelColumn[],
    sheetName: string = 'Sheet1',
  ): Promise<Buffer> {
    // Create workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // Define columns
    worksheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 15,
    }));

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    data.forEach((item) => {
      worksheet.addRow(item);
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate Excel with multiple sheets
   */
  async generateMultiSheetExcel(
    sheets: Array<{
      name: string;
      data: Record<string, any>[];
      columns: ExcelColumn[];
    }>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    sheets.forEach(({ name, data, columns }) => {
      const worksheet = workbook.addWorksheet(name);

      worksheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width || 15,
      }));

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      data.forEach((item) => {
        worksheet.addRow(item);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
```

### Step 3: Use in Controller

```typescript
// src/users/users.controller.ts
import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';
import { ExcelExportService } from '../common/services/excel-export.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly excelService: ExcelExportService,
  ) {}

  @Get('export')
  async exportToExcel(
    @Query('department_id') departmentId?: number,
    @Res({ passthrough: true }) res?: Response,
  ) {
    // Fetch data from database
    const users = await this.usersService.findAll({ department_id: departmentId });

    // Define columns
    const columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 20 },
      { header: 'Department', key: 'department_name', width: 25 },
      { header: 'Created At', key: 'created_at', width: 20 },
    ];

    // Generate Excel buffer
    const buffer = await this.excelService.generateExcel(users, columns, 'Users');

    // Set response headers
    const fileName = `users-export-${Date.now()}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });

    // Return as StreamableFile (NestJS recommended)
    return new StreamableFile(buffer);
  }
}
```

### Step 4: Register Service in Module

```typescript
// src/common/common.module.ts
import { Module, Global } from '@nestjs/common';
import { ExcelExportService } from './services/excel-export.service';

@Global()
@Module({
  providers: [ExcelExportService],
  exports: [ExcelExportService],
})
export class CommonModule {}
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    CommonModule,  // Import globally
    UsersModule,
  ],
})
export class AppModule {}
```

### Step 5: Frontend Integration (React + Axios)

```typescript
// src/api/exports/useExportUsers.ts
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../client';

interface ExportUsersParams {
  department_id?: number;
}

export function useExportUsers() {
  return useMutation({
    mutationFn: async (params: ExportUsersParams) => {
      const response = await apiClient.get('/users/export', {
        params,
        responseType: 'blob',  // ⭐ Critical: get binary data
      });

      // Create blob from response
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `users-export-${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  });
}
```

```typescript
// src/components/UsersTable.tsx
import { Button } from './ui/button';
import { useExportUsers } from '../api/exports/useExportUsers';
import { toast } from 'sonner';

export function UsersTable() {
  const exportUsers = useExportUsers();

  const handleExport = async () => {
    try {
      await exportUsers.mutateAsync({
        department_id: selectedDepartment,
      });
      toast.success('Export completed');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  return (
    <div>
      <Button
        onClick={handleExport}
        disabled={exportUsers.isPending}
      >
        {exportUsers.isPending ? 'Exporting...' : 'Export to Excel'}
      </Button>

      {/* Table content */}
    </div>
  );
}
```

## Advanced Patterns

### 1. Export with Formatting

```typescript
async generateFormattedExcel(data: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  // Define columns with custom formatting
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Amount', key: 'amount', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
  ];

  // Style header
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

  // Add data with formatting
  data.forEach((item, index) => {
    const row = worksheet.addRow(item);

    // Format date column
    row.getCell('date').numFmt = 'yyyy-mm-dd';

    // Format amount as currency
    row.getCell('amount').numFmt = '$#,##0.00';

    // Conditional formatting for status
    if (item.status === 'approved') {
      row.getCell('status').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF92D050' },
      };
    } else if (item.status === 'rejected') {
      row.getCell('status').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' },
      };
    }
  });

  // Auto-filter
  worksheet.autoFilter = {
    from: 'A1',
    to: `C${data.length + 1}`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

### 2. Export with Date Formatting

```typescript
// Transform dates before export
const usersForExport = users.map((user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  created_at: user.created_at.toLocaleDateString(),  // Format date
  updated_at: user.updated_at.toLocaleDateString(),
}));
```

### 3. Large Dataset Streaming (Advanced)

For very large datasets (10,000+ rows), use streaming:

```typescript
@Get('export-large')
async exportLargeDataset(@Res() res: Response) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
    useSharedStrings: true,
  });

  const worksheet = workbook.addWorksheet('Users');

  // Define columns
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
  ];

  // Set headers
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="users-export.xlsx"',
  });

  // Stream data from database
  const userStream = await this.usersService.streamUsers();

  for await (const user of userStream) {
    worksheet.addRow(user).commit();
  }

  await worksheet.commit();
  await workbook.commit();
}
```

### 4. Multiple Sheets Export

```typescript
@Get('export-full-report')
async exportFullReport(@Res({ passthrough: true }) res: Response) {
  const [users, departments, employees] = await Promise.all([
    this.usersService.findAll(),
    this.departmentsService.findAll(),
    this.employeesService.findAll(),
  ]);

  const sheets = [
    {
      name: 'Users',
      data: users,
      columns: [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
      ],
    },
    {
      name: 'Departments',
      data: departments,
      columns: [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Code', key: 'code', width: 15 },
      ],
    },
    {
      name: 'Employees',
      data: employees,
      columns: [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Full Name', key: 'full_name', width: 30 },
        { header: 'Department', key: 'department_name', width: 25 },
      ],
    },
  ];

  const buffer = await this.excelService.generateMultiSheetExcel(sheets);

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="full-report-${Date.now()}.xlsx"`,
    'Content-Length': buffer.length,
  });

  return new StreamableFile(buffer);
}
```

## Verification

After implementation, verify:

1. **Export works:**
   - Click export button in frontend
   - File should download automatically
   - Opens correctly in Excel/LibreOffice

2. **Headers are correct:**
   - Column headers match defined columns
   - Data aligns with headers

3. **Formatting works:**
   - Dates formatted correctly
   - Currency/numbers formatted correctly
   - Conditional formatting applied

4. **Large datasets work:**
   - Test with 1000+ rows
   - Should not timeout
   - Memory usage reasonable

## Example: Complete Implementation

**Backend:**
```typescript
@Get('export')
async exportEmployees(
  @Query('site_id') siteId: number,
  @Res({ passthrough: true }) res: Response,
) {
  const employees = await this.employeesService.findBySite(siteId);

  const columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Full Name', key: 'full_name', width: 30 },
    { header: 'Personal ID', key: 'personal_id', width: 15 },
    { header: 'Department', key: 'department_name', width: 25 },
    { header: 'Intake Date', key: 'intake_date', width: 15 },
    { header: 'Exit Date', key: 'exit_date', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
  ];

  const buffer = await this.excelService.generateExcel(
    employees,
    columns,
    'Employees',
  );

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="employees-site-${siteId}-${Date.now()}.xlsx"`,
    'Content-Length': buffer.length,
  });

  return new StreamableFile(buffer);
}
```

**Frontend:**
```typescript
const exportEmployees = useExportEmployees();

<Button onClick={() => exportEmployees.mutate({ site_id: 1 })}>
  Export Employees
</Button>
```

## Notes

**Common Mistakes:**

1. **Forgetting `responseType: 'blob'` in frontend:**
   - Results in corrupted file
   - Always use `responseType: 'blob'` for binary data

2. **Wrong Content-Type header:**
   - Use `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - Not `application/xlsx` (incorrect MIME type)

3. **Not using StreamableFile:**
   - NestJS recommends wrapping buffers in `StreamableFile`
   - Better performance, proper streaming

4. **Memory issues with large datasets:**
   - Use streaming workbook for 10,000+ rows
   - Don't load entire dataset into memory

5. **Not handling errors:**
   - Export can fail with large datasets
   - Add try-catch and user feedback

**Performance Tips:**

- For < 1000 rows: Buffer-based export (simple)
- For 1000-10000 rows: Buffer-based with pagination
- For 10000+ rows: Streaming workbook
- Add timeout for large exports (300s+)
- Consider background jobs for very large exports

**Alternatives:**

- ✅ ExcelJS: Recommended, lightweight, full-featured
- ❌ xlsx: Heavier, older API
- ❌ CSV export: Simple but no formatting

## References

- [NestJS Export Excel File (Medium)](https://medium.com/@ggluopeihai/nestjs-export-excel-file-697e3891ea8f)
- [Create Excel File with NestJS & ExcelJS](https://medium.com/@ichsanputr/create-excel-file-with-nest-js-excel-js-825ab929bf67)
- [Generate and Download Excel with NestJS and React](https://virangaj.medium.com/excel-file-generation-download-nestjs-and-reactjs-6990f79be75c)
- [ExcelJS GitHub Documentation](https://github.com/exceljs/exceljs)
- [NestJS StreamableFile Documentation](https://docs.nestjs.com/techniques/streaming-files)
