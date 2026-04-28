import { useTable, ColumnDef } from "@refinedev/react-table";
import { List } from "@refinedev/antd";
import { Table, Space, Input, Button } from "antd";
import { EditButton, DeleteButton } from "@refinedev/antd";
import { useCreate, useNavigation, useDelete } from "@refinedev/core";
import { CopyOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";

export const ProductsList = () => {
  const [globalFilter, setGlobalFilter] = useState("");

  const { tableProps, setFilters, refineCore } = useTable({
    columns: [
      { header: "Código", accessorKey: "code" },
      { header: "Nome", accessorKey: "name" },
      { header: "Categoria", accessorKey: "category" },
      {
        header: "Preço",
        accessorKey: "price",
        cell: ({ getValue }) => `R$ ${getValue()?.toFixed(2)}`,
      },
      { header: "Estoque", accessorKey: "stock" },
      {
        id: "actions",
        header: "Ações",
        cell: ({ row }) => (
          <Space>
            <EditButton hideText size="small" recordItemId={row.id} />
            <DeleteButton hideText size="small" recordItemId={row.id} />
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => duplicateProduct(row.original)}
              title="Duplicar"
            />
          </Space>
        ),
      },
    ] as ColumnDef<any>[],
    refineCoreProps: {
      pagination: { pageSize: 20 },
      filters: globalFilter ? [{ field: "name", operator: "contains", value: globalFilter }] : [],
    },
  });

  const { mutate: create } = useCreate();
  const duplicateProduct = (product: any) => {
    const { id, companyId, createdAt, updatedAt, ...rest } = product;
    create({
      resource: "products",
      values: { ...rest, name: `${rest.name} (cópia)` },
    });
  };

  const { push } = useNavigation();

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "n") {
        push("/produtos/criar");
        e.preventDefault();
      }
      if (e.key === "F2" && refineCore?.current?.[0]?.id) {
        push(`/produtos/editar/${refineCore.current[0].id}`);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refineCore]);

  return (
    <List>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Input.Search
          placeholder="Buscar produto (nome ou código)"
          onSearch={(v) => setGlobalFilter(v)}
          style={{ width: 300 }}
          allowClear
        />
        <Button type="primary" onClick={() => push("/produtos/criar")}>
          Novo Produto (Ctrl+N)
        </Button>
      </div>
      <Table {...tableProps} rowKey="id" />
    </List>
  );
};