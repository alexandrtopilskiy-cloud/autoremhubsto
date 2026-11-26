// Типы для ответа (согласно документации)
export type RosskoPart = {
  guid: string;
  partnumber: string;
  name: string;
  brand: string;
  price: string;
  count: number;
  delivery: number;
  comment?: string;
  status: number;
};

export type RosskoOrder = {
  id: number;
  created_date: string;
  delivery_date: string;
  total_price: string;
  payment_status: string;
  extra: number;
  stock_address: string;
  detail: {
    delivery_type: string;
    delivery_address: string;
    payment_type: string;
    company_name: string;
    company_requisites: string;
    comment?: string;
  };
  parts: {
    part: RosskoPart[];
  };
};

export type RosskoResponse = {
  OrdersResult: {
    success: boolean;
    message?: string;
    OrdersList?: {
      Order: RosskoOrder[];
    };
  };
};
