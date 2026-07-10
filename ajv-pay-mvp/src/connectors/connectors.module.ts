import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MoovAdapter } from './adapters/moov.adapter';
import { MixxAdapter } from './adapters/mixx.adapter';
import { ManualAdapter } from './adapters/manual.adapter';
import { CinetpayAdapter } from './adapters/cinetpay.adapter';
import { TestModeAdapter } from './adapters/test-mode.adapter';
import { PAYMENT_ADAPTER_REGISTRY } from './connector.token';
import { PaymentProviderAdapter, ProviderName } from './connector.interface';
import { ConnectorService } from './connector.service';

/**
 * Tous les providers sont enregistrés ensemble dans un registre
 * `Map<ProviderName, PaymentProviderAdapter>`. `ConnectorService` route
 * chaque opération vers l'adapter correspondant au `method` du paiement
 * concerné (moov / mixx / manual) — ce n'est plus un connector unique
 * sélectionné globalement via une variable d'environnement, ce qui
 * corrige une limitation du MVP initial : un paiement avec method=moov
 * était auparavant silencieusement traité par le connector actif
 * (souvent le premier enregistré), quel que soit le `method` réellement
 * demandé.
 *
 * Ajouter un nouveau provider consiste à créer un fichier adapter
 * implémentant `PaymentProviderAdapter`, l'ajouter au tableau `providers`
 * ci-dessous et à la construction du registre — aucun autre fichier du
 * métier (PaymentsService, PaymentOrchestrator) ne change.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    MoovAdapter,
    MixxAdapter,
    ManualAdapter,
    CinetpayAdapter,
    TestModeAdapter,
    ConnectorService,
    {
      provide: PAYMENT_ADAPTER_REGISTRY,
      useFactory: (
        moov: MoovAdapter,
        mixx: MixxAdapter,
        manual: ManualAdapter,
        cinetpay: CinetpayAdapter,
      ): Map<ProviderName, PaymentProviderAdapter> => {
        const entries: Array<[ProviderName, PaymentProviderAdapter]> = [
          ['moov', moov],
          ['mixx', mixx],
          ['manual', manual],
          ['cinetpay', cinetpay],
        ];
        return new Map<ProviderName, PaymentProviderAdapter>(entries);
      },
      inject: [MoovAdapter, MixxAdapter, ManualAdapter, CinetpayAdapter],
    },
  ],
  exports: [PAYMENT_ADAPTER_REGISTRY, ConnectorService],
})
export class ConnectorsModule {}
