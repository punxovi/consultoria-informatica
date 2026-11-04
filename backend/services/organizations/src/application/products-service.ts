import type { ProductsRepository } from '../domain/products.ts';
export function createProductsApplication(repository: ProductsRepository) {
  return {
    authorize: (token: string) => repository.execute(token, 'authorize', {}),
    admin: (token: string, operation: string, input: Record<string, unknown>) => repository.execute(token, operation, input),
    public: (operation: string, input: Record<string, unknown>) => repository.execute(undefined, operation, input, true),
  };
}
export type ProductsApplication = ReturnType<typeof createProductsApplication>;
