import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FloozAdapter } from './adapters/flooz.adapter';
import { MoovAdapter } from './adapters/moov.adapter';
import { CinetPayAdapter } from './adapters/cinetpay.adapter';
import { PAYMENT_ADAPTER_REGISTRY } from './connector.token';
import { PaymentProviderAdapter, ProviderName } from './connector.interface';
import { ConnectorService } from './connector.service';

/**
 * Tous les providers sont enregistrés ensemble dans un registre
 * `Map<ProviderName, PaymentProviderAdapter>`. `ConnectorService` route
 * chaque opération vers l'adapter correspondant au `method` du paiement
 * concerné (flooz / moov / cinetpay) — ce n'est plus un connector unique
 * sélectionné globalement via une variable d'environnement, ce qui
 * corrige une limitation du MVP initial : un paiement avec method=moov
 * était auparavant silencieusement traité par le connector actif
 * (souvent flooz), quel que soit le `method` réellement demandé.
 *
 * Ajouter un nouveau provider (ex: Wave, Mixx) consiste à créer un fichier
 * adapter implémentant `PaymentProviderAdapter`, l'ajouter au tableau
 * `providers` ci-dessous et à la construction du registre — aucun autre
 * fichier du métier (PaymentsService, PaymentOrchestrator) ne change.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    FloozAdapter,
    MoovAdapter,
    CinetPayAdapter,
    ConnectorService,
    {
      provide: PAYMENT_ADAPTER_REGISTRY,
      useFactory: (
        flooz: FloozAdapter,
        moov: MoovAdapter,
        cinetpay: CinetPayAdapter,
      ): Map<ProviderName, PaymentProviderAdapter> => {
        const entries: Array<[ProviderName, PaymentProviderAdapter]> = [
          ['flooz', flooz],
          ['moov', moov],
          ['cinetpay', cinetpay],
        ];
        return new Map<ProviderName, PaymentProviderAdapter>(entries);
      },
      inject: [FloozAdapter, MoovAdapter, CinetPayAdapter],
    },
  ],
  exports: [PAYMENT_ADAPTER_REGISTRY, ConnectorService],
})
export class ConnectorsModule {}
