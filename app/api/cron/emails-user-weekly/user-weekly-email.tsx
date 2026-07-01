import * as React from 'react';
import {Html, Body, Preview, Section, Text, Container, Row, Column, Img, Link, Tailwind} from "react-email";
import {DateTime} from "luxon";
import type {Event} from '@/lib/types/Event';

export type UserWeeklyEmailProps = {
  username: string;
  today: DateTime;
  events: Pick<Event, 'id' | 'name' | 'startDateTime' | 'endDateTime' | 'game' | 'lair' | 'description'>[];
}

export function UserWeeklyEmail(props: UserWeeklyEmailProps) {
  const baseUrl = "https://joutes.app";

  return (
    <Tailwind config={{
      theme: {
        extend: {
          colors: {
            background: 'oklch(0.205 0 0)',
            foreground: 'oklch(0.985 0 0)',
            'primary-foreground': 'oklch(0.205 0 0)',
            'muted-foreground': 'oklch(0.708 0 0)',
          },
        },
      },
    }}>
      <Html lang="fr">
        <Body className="m-0 bg-white p-0 font-15 font-sans">
          <Preview>Les évènements qui vont t&apos;intéresser cette semaine.</Preview>

          <Section className="bg-white m-0 w-full p-0 pt-[92px] mobile:pt-0">
            <Container className="bg-background mx-auto w-full max-w-[640px]">
              <Section className="mobile:px-6 px-[40px] pb-[80px]">
                <Text className="font-72 text-foreground m-0 mt-[64px] font-serif capitalize">
                  Ta Newsletter de la semaine du {props.today.toFormat('dd/MM/yyyy')}
                </Text>
                <Text className="text-md text-foreground m-0 mt-[32px] max-w-[430px] font-sans">
                  Bonjour {props.username},
                </Text>
                <Text
                  className="text-md text-foreground m-0 mt-[32px] max-w-[430px] font-sans mb-[36px]"
                >
                  Comme tu as activé les notifications hebdomadaires pour te tenir au jus des évènements de tes jeux
                  préférés, voici un petit récapitulatif des évènements qui vont t&apos;intéresser cette semaine.
                </Text>

                {props.events.map(event => (
                  <Section key={event.id} className="mb-[36px]">
                    <Link href={`https://joutes.app/events/${event.id}`}>
                      <Row>
                        <Column
                          className="mobile:!block w-[178px] mobile:!w-full max-w-[178px] mobile:!max-w-full align-middle">
                          <Img
                            src={event.game?.banner}
                            alt={event.game?.name ?? ''}
                            width={178}
                            className="block w-full max-w-[178px] mobile:!max-w-full"
                          />
                        </Column>
                        <Column className="mobile:!hidden w-[36px]"/>
                        <Column className="mobile:!block mobile:pt-6 mobile:!w-full mobile:!max-w-full align-middle">
                          <Text className="m-0 text-lg font-serif text-foreground font-bold">
                            {event.name}
                          </Text>
                          {event.lair && (
                            <Text className="m-0 mt-[12px] text-sm font-serif text-foreground">
                              📍 <Link href={`https://joutes.app/lairs/${event.lair?.id}`}>{event.lair?.name}</Link>
                            </Text>
                          )}
                          <Text className="m-0 mt-[12px] text-sm font-serif text-foreground">
                            🕦 {DateTime.fromISO(event.startDateTime).toLocaleString(DateTime.DATETIME_SHORT, {locale: 'fr'})} - {DateTime.fromISO(event.endDateTime).toLocaleString(DateTime.TIME_24_SIMPLE, {locale: 'fr'})}
                          </Text>
                        </Column>
                      </Row>
                    </Link>
                  </Section>
                ))}

                <Text className="text-md text-foreground m-0 mt-[32px] max-w-[430px] font-sans">
                  A bientôt sur <Link href="https://joutes.app">Joutes</Link> !
                </Text>
              </Section>

              {/* Footer */}
              <Section className="mobile:px-6 border-stroke mt-8 border-t px-[40px] pt-[30px] pb-[64px]">
                <Text className="text-md text-muted-foreground m-0 max-w-[320px] font-sans">
                  <Link href="https://joutes.app">Joutes</Link> te tient informé-e des évènements de tes jeux dans tes
                  communautés locales.
                </Text>
                <Row align="left">
                  <Column className="w-full align-top">
                    <Section align="left" className="mt-8 w-[152px]">
                      <Row align="left">
                        <Column className="w-[20px]">
                          <Link href="https://x.com/JoutesApp" className="inline-block">
                            <Img
                              src={`${baseUrl}/images/social/x.png`}
                              alt="X"
                              width="20"
                              height="20"
                              className="block"
                            />
                          </Link>
                        </Column>
                        <Column className="w-[20px]">
                          <Link href="https://discord.gg/dZEGkZwJGB" className="inline-block">
                            <Img
                              src={`${baseUrl}/images/social/discord.png`}
                              alt="Discord"
                              width="20"
                              height="20"
                              className="block"
                            />
                          </Link>
                        </Column>
                        <Column className="w-[20px]">
                          <Link href="https://github.com/Joutes" className="inline-block">
                            <Img
                              src={`${baseUrl}/images/social/gh.png`}
                              alt="GitHub"
                              width="20"
                              height="20"
                              className="block"
                            />
                          </Link>
                        </Column>
                      </Row>
                    </Section>
                  </Column>
                </Row>
                <Row align="left">
                  <Column className="w-full pt-5 align-top">
                    <Text className="font-11 text-muted-foreground m-0 max-w-[169px] font-sans">
                      <Link href="https://joutes.app/account/notifications" className="text-fg-2">
                        Se désinscrire
                      </Link>{' '}
                      des emails de Joutes.
                    </Text>
                  </Column>
                </Row>
              </Section>
            </Container>
          </Section>
        </Body>
      </Html>
    </Tailwind>
  );
}

export default UserWeeklyEmail;
