import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber, Select, Checkbox } from "antd";

export const ProductsEdit = () => {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Código" name="code" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Nome" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Categoria" name="category">
          <Select
            showSearch
            allowClear
            options={[
              { value: "Eletrônicos", label: "Eletrônicos" },
              { value: "Móveis", label: "Móveis" },
            ]}
          />
        </Form.Item>
        <Form.Item label="Preço" name="price">
          <InputNumber prefix="R$" step={0.01} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label="Estoque" name="stock">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="active" valuePropName="checked">
          <Checkbox>Ativo</Checkbox>
        </Form.Item>
      </Form>
    </Edit>
  );
};