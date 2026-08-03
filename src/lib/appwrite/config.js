export const appwriteConfig = {
  endpoint:
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
    process.env.APPWRITE_ENDPOINT ||
    "https://agencia-appwrite.n2wanx.easypanel.host/v1",
  projectId:
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
    process.env.APPWRITE_PROJECT_ID ||
    "6a3edc1b003419265462",
  projectName: process.env.APPWRITE_PROJECT_NAME || "pos",
  databaseId:
    process.env.APPWRITE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ||
    "pos_db",
  collections: {
    userProfiles: process.env.NEXT_PUBLIC_COL_USER_PROFILES || "user_profiles",
    branches: process.env.NEXT_PUBLIC_COL_BRANCHES || "branches",
    branchPaymentMethods:
      process.env.NEXT_PUBLIC_COL_BRANCH_PAYMENT_METHODS ||
      "branch_payment_methods",
    branchPaymentCredentials:
      process.env.COL_BRANCH_PAYMENT_CREDENTIALS ||
      "branch_payment_credentials",
    categories: process.env.NEXT_PUBLIC_COL_CATEGORIES || "categories",
    products: process.env.NEXT_PUBLIC_COL_PRODUCTS || "products",
    stock: process.env.NEXT_PUBLIC_COL_STOCK || "stock",
    stockMovements:
      process.env.NEXT_PUBLIC_COL_STOCK_MOVEMENTS || "stock_movements",
    inventoryGrants:
      process.env.NEXT_PUBLIC_COL_INVENTORY_GRANTS || "inventory_grants",
    sales: process.env.NEXT_PUBLIC_COL_SALES || "sales",
    saleItems: process.env.NEXT_PUBLIC_COL_SALE_ITEMS || "sale_items",
  },
  storageBucket:
    process.env.NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET || "pos_images",
  sessionCookie:
    process.env.SESSION_COOKIE_NAME || "a_session_6a3edc1b003419265462",
};
