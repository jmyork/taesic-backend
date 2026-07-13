import vendapagamentoRepository from '#repositories/vendapagamento_repository'
import {CreatevendapagamentoDTO,UpdatevendapagamentoDTO} from '#dtos/vendapagamento_dto'

export default class vendapagamentoService{

 repo=new vendapagamentoRepository()

list(page?: number, limit?: number, deleted?:DeletedValue, company_alias?: string) {
    return this.repo.paginate(page, limit, deleted, company_alias)
}

 create(data:CreatevendapagamentoDTO){ return this.repo.create(data) }

 show(id:string, company_alias?: string){ return this.repo.findOrFail(id, company_alias) }

 update(id:string,data:UpdatevendapagamentoDTO, company_alias?: string){ return this.repo.update(id,data, company_alias) }

 delete(id:string, company_alias?: string){ return this.repo.softDelete(id, company_alias) }

}
