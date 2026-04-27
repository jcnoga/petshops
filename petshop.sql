/*==============================================================*/
/* DBMS name:      PostgreSQL 9.x                               */
/* Created on:     27/04/2026 04:54:08                          */
/*==============================================================*/


drop table AGENDAMENTOS;

drop table CANAIS;

drop table CATEGORIAS_PRODUTOS;

drop table CATEGORIA_FINANCEIRO;

drop table CATEGORIA_SERVICOS;

drop table CLIENTES;

drop table EMPRESA;

drop table FINANCEIRO;

drop table IMAGESN_PET;

drop table LEMBRETES_AUTOMACAO;

drop table LOGIN;

drop table MOVIMENTO_ESTOQUE;

drop table PERMISSOES_USUARIO;

drop table PETS;

drop table PRODUTOS;

drop table PROFISSIONAIS;

drop table REGRAS_AUTOMACAO;

drop table SERVICOS;

drop table TEMPLATES;

drop table USUARIOS;

drop table VACINA;

drop table VACINAS_PET;

/*==============================================================*/
/* Table: AGENDAMENTOS                                          */
/*==============================================================*/
create table AGENDAMENTOS (
   AGE_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   CLI_ID               INT4                 null,
   PET_ID               INT4                 null,
   POF_ID               INT4                 null,
   AGE_SERVOCO          TEXT                 null,
   AGE_DATA             TIMESTAMP WITH TIME ZONE null,
   AGE_STATUS           TEXT                 null,
   AGE_VALOR            DECIMAL(12,2)        null,
   AGE_OBS              TEXT                 null,
   AGE_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_AGENDAMENTOS primary key (AGE_ID)
);

/*==============================================================*/
/* Table: CANAIS                                                */
/*==============================================================*/
create table CANAIS (
   CAN_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   CAN_CANAL            VARCHAR(20)          null,
   CAN_PROVEDOR         VARCHAR(40)          null,
   CAN_ATIVO            BOOL                 null,
   CAN_PRINCIPAL        BOOL                 null,
   CAN_NOME_EXIBICAO    VARCHAR(100)         null,
   CAN_API_KEY          TEXT                 null,
   CAN_API_SECRET       TEXT                 null,
   CAN_TOKEN            TEXT                 null,
   CAN_FONE_NUMERO      VARCHAR(100)         null,
   CAN_INSTANCE_ID      VARCHAR(150)         null,
   CAN_BUSINESS_ACCOUNT_ID VARCHAR(100)         null,
   CAN_NUMERO_WHATSAPP  VARCHAR(30)          null,
   CAN_URL_BASE         TEXT                 null,
   CAN_RECEBER_RESPOSTAS CHAR(10)             null,
   CAN_CONFIGURACOES_EXTRAS CHAR(10)             null,
   CAN_LIMITE_ENVIO_DIA INT4                 null,
   CAN_LIMIT_ENVIO_MES  INT4                 null,
   CAN_WEBHOOK_URL      TEXT                 null,
   CAN_ENVIAR_AUTOMATICO CHAR(10)             null,
   CAN_USAR_TEMPLATES   CHAR(10)             null,
   CAN_CRIADO_EM        CHAR(10)             null,
   CAN_AUTH_TOKEN       TEXT                 null,
   CAN_STATUS_CONEXAO   VARCHAR(30)          null,
   CAN_ULTIMO_TESTE     TIMESTAMP            null,
   CAN_ATUALIZADO_EM    CHAR(10)             null,
   constraint PK_CANAIS primary key (CAN_ID)
);

/*==============================================================*/
/* Table: CATEGORIAS_PRODUTOS                                   */
/*==============================================================*/
create table CATEGORIAS_PRODUTOS (
   CAP_ID               SERIAL               not null,
   PRO_ID               INT4                 null,
   CAP_CATEGORIA_PROD   TEXT                 null,
   constraint PK_CATEGORIAS_PRODUTOS primary key (CAP_ID)
);

/*==============================================================*/
/* Table: CATEGORIA_FINANCEIRO                                  */
/*==============================================================*/
create table CATEGORIA_FINANCEIRO (
   CFI_ID               SERIAL               not null,
   FIN_ID               INT4                 null,
   CFI_CATEGORIA_ENTRDA VARCHAR(30)          null,
   CFI_CATEGORIA_SAIDA  VARCHAR(30)          null,
   constraint PK_CATEGORIA_FINANCEIRO primary key (CFI_ID)
);

/*==============================================================*/
/* Table: CATEGORIA_SERVICOS                                    */
/*==============================================================*/
create table CATEGORIA_SERVICOS (
   CTS_IS               SERIAL               not null,
   SER_ID               INT4                 null,
   CTS_CATEGORIA        TEXT                 null,
   constraint PK_CATEGORIA_SERVICOS primary key (CTS_IS)
);

/*==============================================================*/
/* Table: CLIENTES                                              */
/*==============================================================*/
create table CLIENTES (
   CLI_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   CLI_NOME             VARCHAR(50)          null,
   CLI_TELEFONE         VARCHAR(30)          null,
   CLI_EMAIL            VARCHAR(100)         null,
   CLI_DOCUMENTO        VARCHAR(50)          null,
   CLI_ENDEREO          VARCHAR(100)         null,
   CLI_BAIRRO           VARCHAR(50)          null,
   CLI_CIDADE           VARCHAR(50)          null,
   CLI_DATA_NASC        DATE                 null,
   CLI_STATUS           VARCHAR(30)          null
      constraint CKC_CLI_STATUS_CLIENTES check (CLI_STATUS is null or (CLI_STATUS in ('ativo','inativo','perdido'))),
   CLI_ORIGEM           VARCHAR(30)          null,
   CLI_OBS              TEXT                 null,
   CLI_ULTIMA_COMPRA_RACAO DATE                 null,
   CLI_PREVISAO_PROX_COMPRA DATE                 null,
   CLI_CRIADO_EM        DATE                 null,
   constraint PK_CLIENTES primary key (CLI_ID)
);

comment on column CLIENTES.CLI_STATUS is
'ativo, inativo, perdido';

/*==============================================================*/
/* Table: EMPRESA                                               */
/*==============================================================*/
create table EMPRESA (
   EMP_ID               SERIAL               not null,
   EMP_RAZAO_SOCIAL     VARCHAR(100)         null,
   EM_NOME_FANTASIA     VARCHAR(100)         null,
   EM_CNPJ              VARCHAR(20)          null,
   EMP_ENDERECO         VARCHAR(100)         null,
   EMP_CEP              VARCHAR(12)          null,
   EMP_CIDADE           VARCHAR(50)          null,
   EMP_ESTADO           VARCHAR(2)           null,
   EMP_TELEFONE         VARCHAR(30)          null,
   EMP_WHATSAPP         VARCHAR(30)          null,
   EMP_STATUS           VARCHAR(30)          null
      constraint CKC_EMP_STATUS_EMPRESA check (EMP_STATUS is null or (EMP_STATUS in ('ativo','inativo','suspenso'))),
   EMP_CRIANDO_EM       TIMESTAMP WITH TIME ZONE null,
   EMP_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   EMP_DIAS_LIBERADOS   INT2                 null,
   EMP_DIAS_FALTANTES   INT2                 null,
   EMP_ATUALIZADO_EM    TIMESTAMP WITH TIME ZONE null,
   EMP_CLIENTE_INATIVO  INT2                 null
      constraint CKC_EMP_CLIENTE_INATI_EMPRESA check (EMP_CLIENTE_INATIVO is null or (EMP_CLIENTE_INATIVO in (30,45,60,75,90))),
   constraint PK_EMPRESA primary key (EMP_ID)
);

comment on column EMPRESA.EMP_STATUS is
'ativo, inativo, suspenso';

comment on column EMPRESA.EMP_ATUALIZADO_EM is
'enviar mensagem automatics com xx dias de inatividade';

/*==============================================================*/
/* Table: FINANCEIRO                                            */
/*==============================================================*/
create table FINANCEIRO (
   FIN_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   CLI_ID               INT4                 null,
   AGE_ID               INT4                 null,
   FIN_TIPO             VARCHAR(20)          null
      constraint CKC_FIN_TIPO_FINANCEI check (FIN_TIPO is null or (FIN_TIPO in ('entrada','saida'))),
   FIN_CATEGORIA        TEXT                 null,
   FIN_VALOR            NUMERIC(12,2)        null,
   FIN_FORM_PAGTO       VARCHAR(50)          null,
   FIN_STATUS           VARCHAR(50)          null
      constraint CKC_FIN_STATUS_FINANCEI check (FIN_STATUS is null or (FIN_STATUS in ('pago','pendente','atrasado'))),
   FIN_DATA_VENC        DATE                 null,
   FIN_DATA_PAGTO       DATE                 null,
   FIN_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_FINANCEIRO primary key (FIN_ID)
);

comment on column FINANCEIRO.FIN_TIPO is
'entrada, saida';

comment on column FINANCEIRO.FIN_STATUS is
'pago, pendente, atrasado';

/*==============================================================*/
/* Table: IMAGESN_PET                                           */
/*==============================================================*/
create table IMAGESN_PET (
   IMG_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   PET_ID               INT4                 null,
   IMG_URL              TEXT                 null,
   IMG_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_IMAGESN_PET primary key (IMG_ID)
);

/*==============================================================*/
/* Table: LEMBRETES_AUTOMACAO                                   */
/*==============================================================*/
create table LEMBRETES_AUTOMACAO (
   LEM_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   CLI_ID               INT4                 null,
   PET_ID               INT4                 null,
   LEM_TIPO             TEXT                 null
      constraint CKC_LEM_TIPO_LEMBRETE check (LEM_TIPO is null or (LEM_TIPO in ('vacina','retorno','aniversario','cliente_sumido','promoção','ultima_compra'))),
   LEM_MENSAGEM         TEXT                 null,
   LEM_CANAL            TEXT                 null
      constraint CKC_LEM_CANAL_LEMBRETE check (LEM_CANAL is null or (LEM_CANAL >= 'whatsapp' and LEM_CANAL in ('whatsapp','email','sms'))),
   LEM_DATA_AGENDADA    TIMESTAMP WITH TIME ZONE null,
   LEM_STATUS           TEXT                 null
      constraint CKC_LEM_STATUS_LEMBRETE check (LEM_STATUS is null or (LEM_STATUS in ('pendente','enviado','falhou'))),
   LEM_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_LEMBRETES_AUTOMACAO primary key (LEM_ID)
);

comment on column LEMBRETES_AUTOMACAO.LEM_TIPO is
'vacina, retorno, aniversario, cliente_sumido, promocao, ultima_compra';

comment on column LEMBRETES_AUTOMACAO.LEM_CANAL is
'whatsapp, email, sms';

comment on column LEMBRETES_AUTOMACAO.LEM_STATUS is
'pendente, enviado, falhou';

/*==============================================================*/
/* Table: LOGIN                                                 */
/*==============================================================*/
create table LOGIN (
   LOG_EMAIL            VARCHAR(50)          not null,
   USU_ID               INT4                 null,
   EMP_ID               INT4                 null,
   LOG_SENHA            VARCHAR(50)          null,
   constraint PK_LOGIN primary key (LOG_EMAIL)
);

/*==============================================================*/
/* Table: MOVIMENTO_ESTOQUE                                     */
/*==============================================================*/
create table MOVIMENTO_ESTOQUE (
   MVE_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   PRO_ID               INT4                 null,
   MVE_TIPO             TEXT                 null
      constraint CKC_MVE_TIPO_MOVIMENT check (MVE_TIPO is null or (MVE_TIPO in ('entrada','saida','ajuste'))),
   MVE_QTDE             INT4                 null,
   MVE_MOTIVO           TEXT                 null,
   MVE_CRIANDO_EM       TIMESTAMP WITH TIME ZONE null,
   constraint PK_MOVIMENTO_ESTOQUE primary key (MVE_ID)
);

comment on column MOVIMENTO_ESTOQUE.MVE_TIPO is
'entrada, saida, ajuste';

/*==============================================================*/
/* Table: PERMISSOES_USUARIO                                    */
/*==============================================================*/
create table PERMISSOES_USUARIO (
   PUS                  SERIAL               not null,
   EMP_ID               INT4                 null,
   USU_ID               INT4                 null,
   PUS_PERMISSAO        VARCHAR(50)          null
      constraint CKC_PUS_PERMISSAO_PERMISSO check (PUS_PERMISSAO is null or (PUS_PERMISSAO in ('opção','acesso','inclusao','alteracao','exclusao','imprimir'))),
   constraint PK_PERMISSOES_USUARIO primary key (PUS)
);

/*==============================================================*/
/* Table: PETS                                                  */
/*==============================================================*/
create table PETS (
   PET_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   CLI_ID               INT4                 null,
   PET_NOME             VARCHAR(50)          null,
   PET_ESPECIE          VARCHAR(30)          null,
   PET_RACA             VARCHAR(30)          null,
   PET_SEXO             DATE                 null,
   PET_DATA_NASC        DATE                 null,
   PET_PESO             DECIMAL(5,3)         null,
   PET_COR              VARCHAR(30)          null,
   PET_CADASTRADO       BOOL                 null
      constraint CKC_PET_CADASTRADO_PETS check (PET_CADASTRADO is null or (PET_CADASTRADO in (true,false))),
   PET_ALERGIAS         TEXT                 null,
   PET_OBS              TEXT                 null,
   PET_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_PETS primary key (PET_ID)
);

comment on column PETS.PET_CADASTRADO is
'true, false';

/*==============================================================*/
/* Table: PRODUTOS                                              */
/*==============================================================*/
create table PRODUTOS (
   PRO_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   PRO_NOME             VARCHAR(50)          null,
   PRO_PRECO_VENDA      NUMERIC(12,2)        null,
   PRO_PRECO_CUSTO      NUMERIC(12,2)        null,
   PRO_ESTOQUE_QTDE     INT4                 null,
   PRO_ESTOQUE_MIN      INT4                 null,
   PRO_CODIGO_BARRAS    VARCHAR(50)          null,
   PRO_ATIVO            BOOL                 null
      constraint CKC_PRO_ATIVO_PRODUTOS check (PRO_ATIVO is null or (PRO_ATIVO in (true,false))),
   constraint PK_PRODUTOS primary key (PRO_ID)
);

/*==============================================================*/
/* Table: PROFISSIONAIS                                         */
/*==============================================================*/
create table PROFISSIONAIS (
   POF_ID               SERIAL               not null,
   PRF_NOME             VARCHAR(50)          null,
   PRF_FUNCAO           VARCHAR(30)          null
      constraint CKC_PRF_FUNCAO_PROFISSI check (PRF_FUNCAO is null or (PRF_FUNCAO in ('veterinario','tosador','recepcionista','banhista','outro'))),
   PRF_TELEFONE         VARCHAR(30)          null,
   PRF_COMISSAO_PERC    NUMERIC(2,2)         null,
   PRF_ATIVO            BOOL                 null
      constraint CKC_PRF_ATIVO_PROFISSI check (PRF_ATIVO is null or (PRF_ATIVO in (true,false))),
   PRF_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_PROFISSIONAIS primary key (POF_ID)
);

comment on column PROFISSIONAIS.PRF_FUNCAO is
'veterinario, tosador, recepcionista, outros';

/*==============================================================*/
/* Table: REGRAS_AUTOMACAO                                      */
/*==============================================================*/
create table REGRAS_AUTOMACAO (
   RAU_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   RAU_NOME             TEXT                 null,
   RAU_TIPO_GATILHO     TEXT                 null
      constraint CKC_RAU_TIPO_GATILHO_REGRAS_A check (RAU_TIPO_GATILHO is null or (RAU_TIPO_GATILHO in ('data','evento','inatividade'))),
   RAU_CONDICOES        TEXT                 null,
   RAU_ACOES            TEXT                 null,
   ATIVO                BOOL                 null
      constraint CKC_ATIVO_REGRAS_A check (ATIVO is null or (ATIVO in (true,false))),
   RAU_CRIADO_EM        TIMESTAMP            null,
   constraint PK_REGRAS_AUTOMACAO primary key (RAU_ID)
);

comment on column REGRAS_AUTOMACAO.RAU_TIPO_GATILHO is
'data, evento, inatividade';

/*==============================================================*/
/* Table: SERVICOS                                              */
/*==============================================================*/
create table SERVICOS (
   SER_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   SER_NOME             TEXT                 null,
   SER_PRECO            DECIMAL(12,2)        null,
   SER_DURACAO_MINUTOS  INT2                 null,
   SER_ATIVO            BOOL                 null
      constraint CKC_SER_ATIVO_SERVICOS check (SER_ATIVO is null or (SER_ATIVO in (true,false))),
   constraint PK_SERVICOS primary key (SER_ID)
);

/*==============================================================*/
/* Table: TEMPLATES                                             */
/*==============================================================*/
create table TEMPLATES (
   TPL_ID               CHAR(10)             null,
   EMP_ID               INT4                 null,
   CAN_ID               INT4                 null,
   TPL_NOME             VARCHAR(100)         null,
   TPL_CANAL            VARCHAR(20)          null,
   TPL_PROVEDOR         VARCHAR(30)          null,
   TPL_TIPO             VARCHAR(30)          null,
   TPL_TITULO           VARCHAR(150)         null,
   TPL_MENSAGEM         TEXT                 null,
   TPL_VARIAVEIS        TEXT                 null,
   TPL_ATIVO            BOOL                 null,
   TPL_AUTOMATICO       BOOL                 null,
   TPL_GATILHO          VARCHAR(50)          null,
   TPL_ORDENS_DIAS      INT4                 null,
   TPL_CRIADO_EM        TIMESTAMP            null,
   TPL_ATUALIZADO_EM    TIMESTAMP            null
);

/*==============================================================*/
/* Table: USUARIOS                                              */
/*==============================================================*/
create table USUARIOS (
   USU_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   USU_NOME             VARCHAR(50)          null,
   USU_EMAIL            VARCHAR(50)          null,
   USU_SENHA            VARCHAR(255)         null,
   USU_PERFIL           VARCHAR(50)          null
      constraint CKC_USU_PERFIL_USUARIOS check (USU_PERFIL is null or (USU_PERFIL in ('perfil:','- admin','- gerente','- recepcionista','- veterinario','- tosador','- banhista','- vendedor','- financeiro','- estoque','- marketing','admin','gerente','recepcionista','veterinario','tosador','banhista','financeito'))),
   USU_ATIVO            BOOL                 null
      constraint CKC_USU_ATIVO_USUARIOS check (USU_ATIVO is null or (USU_ATIVO in (true,false))),
   USU_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_USUARIOS primary key (USU_ID)
);

comment on column USUARIOS.USU_PERFIL is
'- admin
- gerente
- recepcionista
- veterinario
- tosador
- banhista
- vendedor
- financeiro
';

/*==============================================================*/
/* Table: VACINA                                                */
/*==============================================================*/
create table VACINA (
   VAC_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   VAC_NOME             VARCHAR(100)         null,
   VAC_DESCICAO         TEXT                 null,
   VAC_INTERVALO_DIAS   INT4                 null,
   VAC_CRIADO_EM        TIMESTAMP WITH TIME ZONE null,
   constraint PK_VACINA primary key (VAC_ID)
);

/*==============================================================*/
/* Table: VACINAS_PET                                           */
/*==============================================================*/
create table VACINAS_PET (
   VPE_ID               SERIAL               not null,
   EMP_ID               INT4                 null,
   PET_ID               INT4                 null,
   VAC_ID               INT4                 null,
   POF_ID               INT4                 null,
   VPE_DATA_APLICACAO   TIMESTAMP WITH TIME ZONE null,
   VPE_PROXIMA_DOSE     TIMESTAMP WITH TIME ZONE null,
   VPE_LOTE             VARCHAR(50)          null,
   VPE_STATUS           VARCHAR(50)          null
      constraint CKC_VPE_STATUS_VACINAS_ check (VPE_STATUS is null or (VPE_STATUS in ('aplicada','pendente','vencida','atrasada','agendada'))),
   VPE_OBS              TEXT                 null,
   constraint PK_VACINAS_PET primary key (VPE_ID)
);

comment on column VACINAS_PET.VPE_STATUS is
'aplicada
pendente
vencida
atrasada
agendada';

alter table AGENDAMENTOS
   add constraint FK_AGENDAME_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table AGENDAMENTOS
   add constraint FK_AGENDAME_REFERENCE_CLIENTES foreign key (CLI_ID)
      references CLIENTES (CLI_ID)
      on delete restrict on update restrict;

alter table AGENDAMENTOS
   add constraint FK_AGENDAME_REFERENCE_PETS foreign key (PET_ID)
      references PETS (PET_ID)
      on delete restrict on update restrict;

alter table AGENDAMENTOS
   add constraint FK_AGENDAME_REFERENCE_PROFISSI foreign key (POF_ID)
      references PROFISSIONAIS (POF_ID)
      on delete restrict on update restrict;

alter table CANAIS
   add constraint FK_CANAIS_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table CATEGORIAS_PRODUTOS
   add constraint FK_CATEGORI_REFERENCE_PRODUTOS foreign key (PRO_ID)
      references PRODUTOS (PRO_ID)
      on delete restrict on update restrict;

alter table CATEGORIA_FINANCEIRO
   add constraint FK_CATEGORI_REFERENCE_FINANCEI foreign key (FIN_ID)
      references FINANCEIRO (FIN_ID)
      on delete restrict on update restrict;

alter table CATEGORIA_SERVICOS
   add constraint FK_CATEGORI_REFERENCE_SERVICOS foreign key (SER_ID)
      references SERVICOS (SER_ID)
      on delete restrict on update restrict;

alter table CLIENTES
   add constraint FK_CLIENTES_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table FINANCEIRO
   add constraint FK_FINANCEI_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table FINANCEIRO
   add constraint FK_FINANCEI_REFERENCE_CLIENTES foreign key (CLI_ID)
      references CLIENTES (CLI_ID)
      on delete restrict on update restrict;

alter table FINANCEIRO
   add constraint FK_FINANCEI_REFERENCE_AGENDAME foreign key (AGE_ID)
      references AGENDAMENTOS (AGE_ID)
      on delete restrict on update restrict;

alter table IMAGESN_PET
   add constraint FK_IMAGESN__REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table IMAGESN_PET
   add constraint FK_IMAGESN__REFERENCE_PETS foreign key (PET_ID)
      references PETS (PET_ID)
      on delete restrict on update restrict;

alter table LEMBRETES_AUTOMACAO
   add constraint FK_LEMBRETE_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table LEMBRETES_AUTOMACAO
   add constraint FK_LEMBRETE_REFERENCE_CLIENTES foreign key (CLI_ID)
      references CLIENTES (CLI_ID)
      on delete restrict on update restrict;

alter table LEMBRETES_AUTOMACAO
   add constraint FK_LEMBRETE_REFERENCE_PETS foreign key (PET_ID)
      references PETS (PET_ID)
      on delete restrict on update restrict;

alter table LOGIN
   add constraint FK_LOGIN_REFERENCE_USUARIOS foreign key (USU_ID)
      references USUARIOS (USU_ID)
      on delete restrict on update restrict;

alter table LOGIN
   add constraint FK_LOGIN_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table MOVIMENTO_ESTOQUE
   add constraint FK_MOVIMENT_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table MOVIMENTO_ESTOQUE
   add constraint FK_MOVIMENT_REFERENCE_PRODUTOS foreign key (PRO_ID)
      references PRODUTOS (PRO_ID)
      on delete restrict on update restrict;

alter table PERMISSOES_USUARIO
   add constraint FK_PERMISSO_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table PERMISSOES_USUARIO
   add constraint FK_PERMISSO_REFERENCE_USUARIOS foreign key (USU_ID)
      references USUARIOS (USU_ID)
      on delete restrict on update restrict;

alter table PETS
   add constraint FK_PETS_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table PETS
   add constraint FK_PETS_REFERENCE_CLIENTES foreign key (CLI_ID)
      references CLIENTES (CLI_ID)
      on delete restrict on update restrict;

alter table PRODUTOS
   add constraint FK_PRODUTOS_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table REGRAS_AUTOMACAO
   add constraint FK_REGRAS_A_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table SERVICOS
   add constraint FK_SERVICOS_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table TEMPLATES
   add constraint FK_TEMPLATE_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table TEMPLATES
   add constraint FK_TEMPLATE_REFERENCE_CANAIS foreign key (CAN_ID)
      references CANAIS (CAN_ID)
      on delete restrict on update restrict;

alter table USUARIOS
   add constraint FK_USUARIOS_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table VACINA
   add constraint FK_VACINA_REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table VACINAS_PET
   add constraint FK_VACINAS__REFERENCE_EMPRESA foreign key (EMP_ID)
      references EMPRESA (EMP_ID)
      on delete restrict on update restrict;

alter table VACINAS_PET
   add constraint FK_VACINAS__REFERENCE_PETS foreign key (PET_ID)
      references PETS (PET_ID)
      on delete restrict on update restrict;

alter table VACINAS_PET
   add constraint FK_VACINAS__REFERENCE_VACINA foreign key (VAC_ID)
      references VACINA (VAC_ID)
      on delete restrict on update restrict;

alter table VACINAS_PET
   add constraint FK_VACINAS__REFERENCE_PROFISSI foreign key (POF_ID)
      references PROFISSIONAIS (POF_ID)
      on delete restrict on update restrict;

