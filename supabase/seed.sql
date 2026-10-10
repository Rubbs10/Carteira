-- Carteira: carga inicial com as posições do extrato da XTB de 9 de outubro de 2026 (57 ativos, 8 divisões).
-- Correr DEPOIS de schema.sql e DEPOIS de criares a tua conta na página (o ficheiro usa a primeira conta criada).
-- Não duplica: se já existirem posições nessa conta, para com um aviso.
-- Os preços aqui são os do extrato e servem para a página mostrar valores logo; a tarefa de preços substitui-os.

do $$
declare uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then
    raise exception 'Cria primeiro a tua conta na página e volta a correr este ficheiro.';
  end if;
  if exists (select 1 from public.positions where user_id = uid) then
    raise exception 'Esta conta já tem posições; não vou duplicar.';
  end if;

  insert into public.divisions (user_id, name, sort_order) values
    (uid, 'ETFs (plano FIRE)', 1),
    (uid, 'ETFs futuristas', 2),
    (uid, 'Ações top1', 3),
    (uid, 'REITS', 4),
    (uid, 'Dividendos', 5),
    (uid, 'Mercados Emergentes', 6),
    (uid, 'Obrigações', 7),
    (uid, 'PPR', 8);

  insert into public.positions (user_id, division_id, ticker, name, qty, avg_cost, currency)
  select uid, (select d.id from public.divisions d where d.user_id = uid and d.name = v.division), v.ticker, v.name, v.qty, v.avg_cost, v.currency
  from (values
    ('2B76.DE', 'Automation & Robotics', 7.0::numeric, 13.898::numeric, 'EUR', 'ETFs futuristas'),
    ('ABR.US', 'Arbor Realty Trust', 10.0::numeric, 7.63::numeric, 'USD', 'REITS'),
    ('ACN.US', 'Accenture', 0.5::numeric, 139.53::numeric, 'USD', 'Ações top1'),
    ('ADP.US', 'AdP', 0.3::numeric, 229.85::numeric, 'USD', 'Dividendos'),
    ('AMT.US', 'American Tower', 1.0::numeric, 183.36::numeric, 'USD', 'REITS'),
    ('ARE.US', 'Alexandria', 2.0::numeric, 52.34::numeric, 'USD', 'REITS'),
    ('BATT.NL', 'Battery Value-Chain', 3.0::numeric, 28.673::numeric, 'EUR', 'ETFs futuristas'),
    ('CCI.US', 'Crown Castle', 1.0::numeric, 76.36::numeric, 'USD', 'REITS'),
    ('CIBR.UK', 'First Trust Nasdaq Cybersec', 2.0::numeric, 43.43::numeric, 'USD', 'ETFs futuristas'),
    ('CMCSA.US', 'Comcast', 5.0::numeric, 27.416::numeric, 'USD', 'Dividendos'),
    ('COP.US', 'ConocoPhillips', 1.0::numeric, 90.4::numeric, 'USD', 'Ações top1'),
    ('CRM.US', 'Salesforce', 0.5::numeric, 257.72::numeric, 'USD', 'Ações top1'),
    ('CTO.US', 'CTO Realty Growth', 5.0::numeric, 16.56::numeric, 'USD', 'REITS'),
    ('DLR.US', 'Digital Realty', 1.0::numeric, 159.78::numeric, 'USD', 'REITS'),
    ('ESIH.DE', 'MSCI Europe Health Care Sctr', 14.0::numeric, 6.944::numeric, 'EUR', null::text),
    ('ESP0.DE', 'Video Gaming and eSports', 2.0::numeric, 52.97::numeric, 'EUR', 'ETFs futuristas'),
    ('FWIA.DE', 'FTSE All World', 15.0::numeric, 6.996::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('GIS.US', 'General Mills', 2.0::numeric, 37.43::numeric, 'USD', 'Dividendos'),
    ('INTU.US', 'Intuit', 0.5::numeric, 447.444::numeric, 'USD', 'Ações top1'),
    ('IQQ0.DE', 'Edge MSCI World Min Volatility', 1.5::numeric, 66.49::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('IS3N.DE', 'Core MSCI EM IMI', 2.0::numeric, 36.33::numeric, 'EUR', 'Mercados Emergentes'),
    ('IS3S.DE', 'Edge MSCI World Value Factor', 1.5::numeric, 53.437::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('IUSL.DE', 'iShs Dow Jones Gbl Sust Scrnd', 2.0::numeric, 77.26::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('IUSN.DE', 'Msci World Small Cap', 11.0::numeric, 8.833::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('KMB.US', 'Kimberly-Clark', 1.9882::numeric, 98.8359::numeric, 'USD', 'Dividendos'),
    ('LSMC.DE', 'MSCI Semiconductors ESG Filtered', 1.3543::numeric, 74.256::numeric, 'EUR', 'ETFs futuristas'),
    ('MAA.US', 'MAA', 0.6::numeric, 136.59::numeric, 'USD', 'REITS'),
    ('MCHP.US', 'Microchip', 3.0::numeric, 61.4367::numeric, 'USD', 'Ações top1'),
    ('MPW.US', 'Medical Properties', 18.0::numeric, 5.01::numeric, 'USD', 'REITS'),
    ('MSFT.US', 'Microsoft', 0.5::numeric, 370.96::numeric, 'USD', 'Ações top1'),
    ('NFLX.US', 'Netflix', 1.0::numeric, 75.54::numeric, 'USD', 'Ações top1'),
    ('NKE.US', 'Nike', 2.0::numeric, 36.79::numeric, 'USD', 'Ações top1'),
    ('NOW.US', 'ServiceNow', 1.0::numeric, 102.34::numeric, 'USD', 'Ações top1'),
    ('NUKL.DE', 'Uranium and Nuclear Technlgs', 2.0::numeric, 52.96::numeric, 'EUR', 'ETFs futuristas'),
    ('NVO.US', 'Novo Nordisk', 4.0::numeric, 48.005::numeric, 'USD', 'Ações top1'),
    ('O.US', 'Realty', 2.0::numeric, 60.54::numeric, 'USD', 'REITS'),
    ('ORCL.US', 'Oracle', 1.5062::numeric, 146.7268::numeric, 'USD', 'Ações top1'),
    ('PSA.US', 'Public Storage', 0.3636::numeric, 275.0::numeric, 'USD', 'REITS'),
    ('QCOM.US', 'Qualcomm', 0.5::numeric, 158.0::numeric, 'USD', 'Ações top1'),
    ('QDVE.DE', 'S&P 500 IT Sector', 6.0::numeric, 34.8075::numeric, 'EUR', 'ETFs futuristas'),
    ('QDVI.DE', 'Edge MSCI USA Value Factor', 10.0::numeric, 10.228::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('REXR.US', 'Rexford Industrial', 3.0::numeric, 36.52::numeric, 'USD', 'REITS'),
    ('SAP.DE', 'SAP', 0.4408::numeric, 226.9::numeric, 'EUR', 'Ações top1'),
    ('UBER.US', 'Uber', 2.0::numeric, 89.52::numeric, 'USD', 'Ações top1'),
    ('UNH.US', 'UnitedHealth', 0.5::numeric, 347.38::numeric, 'USD', 'Ações top1'),
    ('V9N.DE', 'Data Cetr Reits and Digi Infr', 3.0::numeric, 22.095::numeric, 'EUR', 'REITS'),
    ('VNA.DE', 'Vonovia', 4.0::numeric, 23.25::numeric, 'EUR', 'REITS'),
    ('VSNT.US', 'Versant Media Group', 0.12::numeric, 0.01::numeric, 'USD', 'Ações top1'),
    ('VUAA.DE', 'S&P 500', 1.9997::numeric, 107.765::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('VWCE.DE', 'FTSE All-World', 1.0::numeric, 138.42::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('WEBN.DE', 'Prime All Country World', 8.0::numeric, 12.486::numeric, 'EUR', 'ETFs (plano FIRE)'),
    ('WQTM.DE', 'Quantum Computing', 5.0::numeric, 32.992::numeric, 'EUR', 'ETFs futuristas'),
    ('WSO.US', 'Watsco', 0.3::numeric, 318.05::numeric, 'USD', 'Dividendos'),
    ('WTEM.DE', 'Global Qual Div Gro', 4.5519::numeric, 40.8439::numeric, 'EUR', 'Dividendos'),
    ('XAD6.DE', 'DB Physical Silver', 0.291::numeric, 687.2::numeric, 'EUR', null::text),
    ('XAIX.DE', 'Artificial Intelligence and Big Data', 0.5::numeric, 151.5::numeric, 'EUR', 'ETFs futuristas'),
    ('XESC.DE', 'Euro Stoxx 50', 2.0::numeric, 99.825::numeric, 'EUR', 'ETFs (plano FIRE)')
  ) as v(ticker, name, qty, avg_cost, currency, division);

  insert into public.quotes (symbol, price, prev_close, currency, as_of, source) values
    ('2B76.DE', 19.896, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('ABR', 2.96, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('ACN', 207.85, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('ADP', 271.09, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('AMT', 180.82, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('ARE', 45.36, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('BATT.AS', 25.77, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('CCI', 78.98, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('CIBR.L', 68.07, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('CMCSA', 20.69, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('COP', 135.19, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('CRM', 228.24, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('CTO', 20.49, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('DLR', 178.64, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('ESIH.DE', 6.946, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('ESP0.DE', 58.31, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('FWIA.DE', 8.506, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('GIS', 32.06, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('INTU', 304.69, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('IQQ0.DE', 68.48, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('IS3N.DE', 48.831, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('IS3S.DE', 71.29, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('IUSL.DE', 92.06, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('IUSN.DE', 9.074, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('KMB', 97.87, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('LSMC.DE', 118.68, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('MAA', 116.34, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('MCHP', 74.61, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('MPW', 3.11, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('MSFT', 533.7, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('NFLX', 70.85, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('NKE', 34.9, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('NOW', 140.9, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('NUKL.DE', 42.54, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('NVO', 38.39, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('O', 54.04, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('ORCL', 141.53, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('PSA', 287.78, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('QCOM', 173.52, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('QDVE.DE', 48.55, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('QDVI.DE', 17.0, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('REXR', 36.98, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('SAP.DE', 191.98, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('UBER', 71.82, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('UNH', 375.07, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('V9N.DE', 22.51, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('VNA.DE', 16.345, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('VSNT', 30.73, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('VUAA.DE', 134.715, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('VWCE.DE', 172.78, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('WEBN.DE', 13.304, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('WQTM.DE', 32.43, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('WSO', 278.58, null, 'USD', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('WTEM.DE', 43.715, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('XAD6.DE', 507.65, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('XAIX.DE', 225.35, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato'),
    ('XESC.DE', 110.26, null, 'EUR', '2026-10-09 15:32:33+00', 'xtb-extrato')
  on conflict (symbol) do nothing;

  insert into public.fx_rates (pair, rate, as_of) values ('USD_EUR', 0.8934, '2026-10-09 15:32:33+00') on conflict (pair) do nothing;

  perform public._snapshot_for(uid);
end $$;
