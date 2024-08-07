import { t } from '@lingui/macro';
import { Group, Text } from '@mantine/core';
import {
  IconArrowRight,
  IconShoppingCart,
  IconTool
} from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';

import { PartHoverCard } from '../../components/images/Thumbnail';
import { ProgressBar } from '../../components/items/ProgressBar';
import { ApiEndpoints } from '../../enums/ApiEndpoints';
import { ModelType } from '../../enums/ModelType';
import { useTable } from '../../hooks/UseTable';
import { apiUrl } from '../../states/ApiState';
import { useUserState } from '../../states/UserState';
import { TableColumn } from '../Column';
import { BooleanColumn } from '../ColumnRenderers';
import { TableFilter } from '../Filter';
import { InvenTreeTable } from '../InvenTreeTable';
import { TableHoverCard } from '../TableHoverCard';

export default function BuildLineTable({ params = {} }: { params?: any }) {
  const table = useTable('buildline');
  const user = useUserState();

  const tableFilters: TableFilter[] = useMemo(() => {
    return [
      {
        name: 'allocated',
        label: t`Allocated`,
        description: t`Show allocated lines`
      },
      {
        name: 'available',
        label: t`Available`,
        description: t`Show lines with available stock`
      },
      {
        name: 'consumable',
        label: t`Consumable`,
        description: t`Show consumable lines`
      },
      {
        name: 'optional',
        label: t`Optional`,
        description: t`Show optional lines`
      },
      {
        name: 'tracked',
        label: t`Tracked`,
        description: t`Show tracked lines`
      }
    ];
  }, []);

  const renderAvailableColumn = useCallback((record: any) => {
    let bom_item = record?.bom_item_detail ?? {};
    let extra: any[] = [];
    let available = record?.available_stock;

    // Account for substitute stock
    if (record.available_substitute_stock > 0) {
      available += record.available_substitute_stock;
      extra.push(
        <Text key="substitite" size="sm">
          {t`Includes substitute stock`}
        </Text>
      );
    }

    // Account for variant stock
    if (bom_item.allow_variants && record.available_variant_stock > 0) {
      available += record.available_variant_stock;
      extra.push(
        <Text key="variant" size="sm">
          {t`Includes variant stock`}
        </Text>
      );
    }

    // Account for in-production stock
    if (record.in_production > 0) {
      extra.push(
        <Text key="production" size="sm">
          {t`In production`}: {record.in_production}
        </Text>
      );
    }

    // Account for stock on order
    if (record.on_order > 0) {
      extra.push(
        <Text key="on-order" size="sm">
          {t`On order`}: {record.on_order}
        </Text>
      );
    }

    // Account for "external" stock
    if (record.external_stock > 0) {
      extra.push(
        <Text key="external" size="sm">
          {t`External stock`}: {record.external_stock}
        </Text>
      );
    }

    return (
      <TableHoverCard
        value={
          available > 0 ? (
            available
          ) : (
            <Text
              c="red"
              style={{ fontStyle: 'italic' }}
            >{t`No stock available`}</Text>
          )
        }
        title={t`Available Stock`}
        extra={extra}
      />
    );
  }, []);

  const tableColumns: TableColumn[] = useMemo(() => {
    return [
      {
        accessor: 'bom_item',
        ordering: 'part',
        sortable: true,
        switchable: false,
        render: (record: any) => <PartHoverCard part={record.part_detail} />
      },
      {
        accessor: 'bom_item_detail.reference',
        ordering: 'reference',
        sortable: true,
        title: t`Reference`
      },
      BooleanColumn({
        accessor: 'bom_item_detail.optional',
        ordering: 'optional'
      }),
      BooleanColumn({
        accessor: 'bom_item_detail.consumable',
        ordering: 'consumable'
      }),
      BooleanColumn({
        accessor: 'bom_item_detail.allow_variants',
        ordering: 'allow_variants'
      }),
      BooleanColumn({
        accessor: 'bom_item_detail.inherited',
        ordering: 'inherited',
        title: t`Gets Inherited`
      }),
      BooleanColumn({
        accessor: 'part_detail.trackable',
        ordering: 'trackable'
      }),
      {
        accessor: 'bom_item_detail.quantity',
        sortable: true,
        title: t`Unit Quantity`,
        ordering: 'unit_quantity',
        render: (record: any) => {
          return (
            <Group justify="space-between">
              <Text>{record.bom_item_detail?.quantity}</Text>
              {record?.part_detail?.units && (
                <Text size="xs">[{record.part_detail.units}]</Text>
              )}
            </Group>
          );
        }
      },
      {
        accessor: 'quantity',
        sortable: true,
        render: (record: any) => {
          return (
            <Group justify="space-between">
              <Text>{record.quantity}</Text>
              {record?.part_detail?.units && (
                <Text size="xs">[{record.part_detail.units}]</Text>
              )}
            </Group>
          );
        }
      },
      {
        accessor: 'available_stock',
        sortable: true,
        switchable: false,
        render: renderAvailableColumn
      },
      {
        accessor: 'allocated',
        switchable: false,
        render: (record: any) => {
          return record?.bom_item_detail?.consumable ? (
            <Text style={{ fontStyle: 'italic' }}>{t`Consumable item`}</Text>
          ) : (
            <ProgressBar
              progressLabel={true}
              value={record.allocated}
              maximum={record.quantity}
            />
          );
        }
      }
    ];
  }, []);

  const rowActions = useCallback(
    (record: any) => {
      let part = record.part_detail;

      // Consumable items have no appropriate actions
      if (record?.bom_item_detail?.consumable) {
        return [];
      }

      // Tracked items must be allocated to a particular output
      if (record?.part_detail?.trackable) {
        return [];
      }

      return [
        {
          icon: <IconArrowRight />,
          title: t`Allocate Stock`,
          hidden: record.allocated >= record.quantity,
          color: 'green'
        },
        {
          icon: <IconShoppingCart />,
          title: t`Order Stock`,
          hidden: !part?.purchaseable,
          color: 'blue'
        },
        {
          icon: <IconTool />,
          title: t`Build Stock`,
          hidden: !part?.assembly,
          color: 'blue'
        }
      ];
    },
    [user]
  );

  return (
    <InvenTreeTable
      url={apiUrl(ApiEndpoints.build_line_list)}
      tableState={table}
      columns={tableColumns}
      props={{
        params: {
          ...params,
          part_detail: true
        },
        tableFilters: tableFilters,
        rowActions: rowActions,
        modelType: ModelType.part,
        modelField: 'part_detail.pk',
        enableDownload: true
      }}
    />
  );
}
