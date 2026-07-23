import 'package:open_file/open_file.dart';

Future<void> openApk(String path) async {
  await OpenFile.open(path);
}
