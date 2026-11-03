
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import MapView, { Marker, Polyline } from 'react-native-maps';

const dbPromise = SQLite.openDatabaseAsync('meupet.db');

export default function App() {
  const [tela, setTela] = useState('inicio');
  const [pets, setPets] = useState([]);
  const [nome, setNome] = useState('');
  const [raca, setRaca] = useState('');
  const [idade, setIdade] = useState('');
  const [peso, setPeso] = useState('');
  const [foto, setFoto] = useState(null);

  const [carregando, setCarregando] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [transportando, setTransportando] = useState(false);
  const [petSelecionado, setPetSelecionado] = useState(null);
  const [localizacao, setLocalizacao] = useState(null);
  const [trajeto, setTrajeto] = useState([]);

  const rastreador = useRef(null);
  const mapaRef = useRef(null);

  useEffect(() => {
    iniciarBanco();

    return () => {
      if (rastreador.current) {
        rastreador.current.remove();
        rastreador.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (localizacao && mapaRef.current && tela === 'transporte') {
      mapaRef.current.animateToRegion(
        {
          latitude: localizacao.latitude,
          longitude: localizacao.longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        },
        800
      );
    }
  }, [localizacao, tela]);

  async function iniciarBanco() {
    try {
      const db = await dbPromise;
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          raca TEXT,
          idade TEXT,
          peso TEXT,
          foto TEXT
        );
      `);
      await carregarPets();
    } catch (erro) {
      Alert.alert('Erro', 'Não foi possível abrir os cadastros.');
    } finally {
      setCarregando(false);
    }
  }

  async function carregarPets() {
    const db = await dbPromise;
    const dados = await db.getAllAsync(
      'SELECT * FROM pets ORDER BY id DESC'
    );
    setPets(dados);
  }

  async function escolherFoto() {
    try {
      const permissao =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissao.granted) {
        Alert.alert(
          'Permissão necessária',
          'Permita o acesso à galeria do celular.'
        );
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!resultado.canceled && resultado.assets.length > 0) {
        setFoto(resultado.assets[0].uri);
      }
    } catch (erro) {
      Alert.alert('Erro', 'Não foi possível escolher a foto.');
    }
  }

  async function salvarPet() {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'Digite o nome do pet.');
      return;
    }

    try {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO pets (nome, raca, idade, peso, foto)
         VALUES (?, ?, ?, ?, ?)`,
        [
          nome.trim(),
          raca.trim(),
          idade.trim(),
          peso.trim(),
          foto,
        ]
      );

      setNome('');
      setRaca('');
      setIdade('');
      setPeso('');
      setFoto(null);

      await carregarPets();
      setTela('inicio');

      Alert.alert('Cadastro realizado', 'Pet salvo com sucesso!');
    } catch (erro) {
      Alert.alert('Erro', 'Não foi possível salvar o pet.');
    }
  }

  function excluirPet(pet) {
    if (transportando && petSelecionado?.id === pet.id) {
      Alert.alert(
        'Transporte ativo',
        'Finalize o transporte antes de excluir este pet.'
      );
      return;
    }

    Alert.alert(
      'Excluir cadastro',
      `Deseja excluir ${pet.nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await dbPromise;
              await db.runAsync(
                'DELETE FROM pets WHERE id = ?',
                [pet.id]
              );
              await carregarPets();
            } catch (erro) {
              Alert.alert('Erro', 'Não foi possível excluir.');
            }
          },
        },
      ]
    );
  }

  async function iniciarTransporte(pet) {
    if (iniciando || transportando) return;

    setIniciando(true);

    try {
      const permissao =
        await Location.requestForegroundPermissionsAsync();

      if (permissao.status !== 'granted') {
        Alert.alert(
          'Localização',
          'Permita o acesso à localização do celular.'
        );
        return;
      }

      const servicoAtivo =
        await Location.hasServicesEnabledAsync();

      if (!servicoAtivo) {
        Alert.alert(
          'GPS desligado',
          'Ative a localização do celular e tente novamente.'
        );
        return;
      }

      const posicao = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coordenadaInicial = {
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
      };

      const assinatura = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (novaPosicao) => {
          const coords = novaPosicao.coords;

          setLocalizacao(coords);

          const ponto = {
            latitude: coords.latitude,
            longitude: coords.longitude,
          };

          setTrajeto((anterior) => [...anterior, ponto]);
        },
        (erro) => {
          console.log('Erro no GPS:', erro);
        }
      );

      rastreador.current = assinatura;
      setPetSelecionado(pet);
      setLocalizacao(posicao.coords);
      setTrajeto([coordenadaInicial]);
      setTransportando(true);
      setTela('transporte');
    } catch (erro) {
      Alert.alert(
        'Erro',
        'Não foi possível iniciar a localização. Verifique o GPS.'
      );
    } finally {
      setIniciando(false);
    }
  }

  function finalizarTransporte() {
    if (rastreador.current) {
      rastreador.current.remove();
      rastreador.current = null;
    }

    setTransportando(false);
    setPetSelecionado(null);
    setLocalizacao(null);
    setTrajeto([]);
    setTela('inicio');

    Alert.alert(
      'Transporte finalizado',
      'O acompanhamento foi encerrado.'
    );
  }

  function Botao({
    titulo,
    onPress,
    secundario = false,
    disabled = false,
  }) {
    return (
      <TouchableOpacity
        style={[
          styles.botao,
          secundario && styles.botaoSecundario,
          disabled && styles.botaoDesabilitado,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.textoBotao,
            secundario && styles.textoSecundario,
          ]}
        >
          {titulo}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.conteudo}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.cabecalho}>
          <Text style={styles.logo}>MeuPet</Text>
          <Text style={styles.subtitulo}>
            Cuidado e segurança para seu melhor amigo
          </Text>
        </View>

        {carregando ? (
          <ActivityIndicator size="large" color="#7552A3" />
        ) : (
          <>
            {tela === 'inicio' && (
              <View>
                <Text style={styles.titulo}>Meus pets</Text>
                <Text style={styles.descricao}>
                  Gerencie seus animais e acompanhe os transportes.
                </Text>

                <Botao
                  titulo="+ Cadastrar pet"
                  onPress={() => setTela('cadastro')}
                />

                {transportando && (
                  <Botao
                    titulo="📍 Ver transporte em andamento"
                    secundario
                    onPress={() => setTela('transporte')}
                  />
                )}

                {pets.length === 0 && (
                  <View style={styles.cardVazio}>
                    <Text style={styles.tituloVazio}>
                      Nenhum pet cadastrado
                    </Text>
                    <Text style={styles.textoVazio}>
                      Adicione seu primeiro animal para começar.
                    </Text>
                  </View>
                )}

                {pets.map((pet) => (
                  <View key={pet.id} style={styles.card}>
                    <View style={styles.perfil}>
                      {pet.foto ? (
                        <Image
                          source={{ uri: pet.foto }}
                          style={styles.fotoPet}
                        />
                      ) : (
                        <View style={styles.semFoto}>
                          <Text style={styles.inicial}>
                            {pet.nome.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={styles.infoPerfil}>
                        <Text style={styles.nomePet}>
                          {pet.nome}
                        </Text>
                        <Text style={styles.textoInfo}>
                          {pet.raca || 'Raça não informada'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.linha} />

                    <Text style={styles.detalhes}>
                      Idade: {pet.idade || 'Não informada'}
                    </Text>
                    <Text style={styles.detalhes}>
                      Peso: {pet.peso || 'Não informado'}
                    </Text>

                    <Botao
                      titulo={
                        iniciando
                          ? 'Obtendo localização...'
                          : '🚗 Iniciar transporte'
                      }
                      onPress={() => iniciarTransporte(pet)}
                      disabled={iniciando || transportando}
                    />

                    <Botao
                      titulo="Excluir cadastro"
                      secundario
                      onPress={() => excluirPet(pet)}
                    />
                  </View>
                ))}
              </View>
            )}

            {tela === 'cadastro' && (
              <View>
                <Text style={styles.titulo}>Cadastrar pet</Text>
                <Text style={styles.descricao}>
                  Preencha os dados do seu animal.
                </Text>

                <View style={styles.card}>
                  <TouchableOpacity
                    style={styles.areaFoto}
                    onPress={escolherFoto}
                  >
                    {foto ? (
                      <Image
                        source={{ uri: foto }}
                        style={styles.preview}
                      />
                    ) : (
                      <View style={styles.placeholderFoto}>
                        <Text style={styles.textoFoto}>
                          📷 Adicionar foto
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.label}>Nome</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Nome do pet"
                    placeholderTextColor="#A49CB0"
                    value={nome}
                    onChangeText={setNome}
                  />

                  <Text style={styles.label}>Raça</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Golden Retriever"
                    placeholderTextColor="#A49CB0"
                    value={raca}
                    onChangeText={setRaca}
                  />

                  <Text style={styles.label}>Idade</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 3 anos"
                    placeholderTextColor="#A49CB0"
                    value={idade}
                    onChangeText={setIdade}
                  />

                  <Text style={styles.label}>Peso</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 12 kg"
                    placeholderTextColor="#A49CB0"
                    value={peso}
                    onChangeText={setPeso}
                  />

                  <Botao
                    titulo="Salvar cadastro"
                    onPress={salvarPet}
                  />
                  <Botao
                    titulo="Cancelar"
                    secundario
                    onPress={() => setTela('inicio')}
                  />
                </View>
              </View>
            )}

            {tela === 'transporte' && (
              <View>
                <Text style={styles.titulo}>Transporte</Text>
                <Text style={styles.descricao}>
                  Acompanhe a localização durante o trajeto.
                </Text>

                <View style={styles.card}>
                  <Text style={styles.nomeTransporte}>
                    {petSelecionado?.nome}
                  </Text>

                  <View style={styles.statusBox}>
                    <View style={styles.pontoVerde} />
                    <Text style={styles.statusTexto}>
                      Transporte em andamento
                    </Text>
                  </View>

                  <Text style={styles.aviso}>
                    O mapa acompanha o celular que está
                    transportando o pet.
                  </Text>

                  {localizacao ? (
                    <>
                      <View style={styles.mapaContainer}>
                        <MapView
                          ref={mapaRef}
                          style={styles.mapa}
                          initialRegion={{
                            latitude: localizacao.latitude,
                            longitude: localizacao.longitude,
                            latitudeDelta: 0.006,
                            longitudeDelta: 0.006,
                          }}
                          showsUserLocation={true}
                          showsCompass={true}
                          showsMyLocationButton={true}
                        >
                          <Marker
                            coordinate={{
                              latitude: localizacao.latitude,
                              longitude: localizacao.longitude,
                            }}
                            title="Localização do transporte"
                            description={
                              petSelecionado
                                ? `Transportando ${petSelecionado.nome}`
                                : 'Localização atual'
                            }
                            pinColor="#7552A3"
                          />

                          {trajeto.length > 1 && (
                            <Polyline
                              coordinates={trajeto}
                              strokeColor="#7552A3"
                              strokeWidth={4}
                            />
                          )}
                        </MapView>
                      </View>

                      <Text style={styles.infoMapa}>
                        📍 Localização atualizada pelo GPS
                      </Text>

                      <View style={styles.infoLocalizacao}>
                        <Text style={styles.infoTitulo}>
                          Sua localização
                        </Text>

                        <Text style={styles.coordenada}>
                          Latitude: {localizacao.latitude.toFixed(6)}
                        </Text>

                        <Text style={styles.coordenada}>
                          Longitude: {localizacao.longitude.toFixed(6)}
                        </Text>

                        <Text style={styles.precisao}>
                          Precisão aproximada: {
                            localizacao.accuracy != null
                              ? `${Math.round(localizacao.accuracy)} metros`
                              : 'Indisponível'
                          }
                        </Text>
                      </View>
                    </>
                  ) : (
                    <ActivityIndicator
                      size="large"
                      color="#7552A3"
                    />
                  )}

                  <Botao
                    titulo="Finalizar transporte"
                    onPress={finalizarTransporte}
                  />

                  <Botao
                    titulo="Voltar aos pets"
                    secundario
                    onPress={() => setTela('inicio')}
                  />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6FC',
  },
  conteudo: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 50,
  },
  cabecalho: {
    marginBottom: 32,
  },
  logo: {
    fontSize: 34,
    fontWeight: '800',
    color: '#684492',
    letterSpacing: -1,
  },
  subtitulo: {
    fontSize: 13,
    color: '#898095',
    marginTop: 5,
  },
  titulo: {
    fontSize: 25,
    fontWeight: '700',
    color: '#342747',
    marginBottom: 7,
  },
  descricao: {
    fontSize: 14,
    color: '#8B8197',
    marginBottom: 20,
    lineHeight: 21,
  },
  botao: {
    backgroundColor: '#7552A3',
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  botaoSecundario: {
    backgroundColor: '#EEE8F5',
  },
  botaoDesabilitado: {
    opacity: 0.5,
  },
  textoBotao: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  textoSecundario: {
    color: '#684492',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#F0ECF5',
  },
  perfil: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fotoPet: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  semFoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EAE0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inicial: {
    color: '#7552A3',
    fontSize: 30,
    fontWeight: '700',
  },
  infoPerfil: {
    marginLeft: 15,
    flex: 1,
  },
  nomePet: {
    fontSize: 21,
    fontWeight: '700',
    color: '#342747',
  },
  textoInfo: {
    color: '#908599',
    fontSize: 14,
    marginTop: 4,
  },
  linha: {
    height: 1,
    backgroundColor: '#F0ECF5',
    marginVertical: 16,
  },
  detalhes: {
    fontSize: 14,
    color: '#70677E',
    marginBottom: 7,
  },
  cardVazio: {
    backgroundColor: '#FFFFFF',
    marginTop: 22,
    padding: 28,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0ECF5',
  },
  tituloVazio: {
    fontSize: 17,
    fontWeight: '700',
    color: '#514061',
  },
  textoVazio: {
    fontSize: 13,
    textAlign: 'center',
    color: '#968B9F',
    marginTop: 8,
  },
  areaFoto: {
    alignItems: 'center',
    marginBottom: 25,
  },
  preview: {
    width: 130,
    height: 130,
    borderRadius: 16,
  },
  placeholderFoto: {
    width: 150,
    height: 130,
    borderRadius: 16,
    backgroundColor: '#F0EAF7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0D4EE',
    borderStyle: 'dashed',
  },
  textoFoto: {
    color: '#7552A3',
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    color: '#514061',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#FAF9FC',
    borderWidth: 1,
    borderColor: '#E9E3EF',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#342747',
    marginBottom: 17,
  },
  nomeTransporte: {
    fontSize: 24,
    fontWeight: '700',
    color: '#342747',
    marginBottom: 18,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF7F0',
    borderRadius: 10,
    padding: 13,
    marginBottom: 18,
  },
  pontoVerde: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#3D9C6B',
    marginRight: 10,
  },
  statusTexto: {
    color: '#23764C',
    fontSize: 14,
    fontWeight: '600',
  },
  aviso: {
    color: '#817689',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 15,
  },
  mapaContainer: {
    width: '100%',
    height: 350,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#EEE8F5',
  },
  mapa: {
    width: '100%',
    height: '100%',
  },
  infoMapa: {
    fontSize: 12,
    color: '#817689',
    marginTop: 12,
    textAlign: 'center',
  },
  infoLocalizacao: {
    backgroundColor: '#F6F2FA',
    borderRadius: 13,
    padding: 17,
    marginTop: 20,
    marginBottom: 10,
  },
  infoTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#57416B',
    marginBottom: 12,
  },
  coordenada: {
    fontSize: 14,
    color: '#57416B',
    marginBottom: 8,
  },
  precisao: {
    fontSize: 12,
    color: '#93879F',
    marginTop: 6,
  },
});
