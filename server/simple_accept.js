// Простая система принятия заявок
app.post('/api/requests/:requestId/accept', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const requestId = Number(req.params.requestId);
    console.log('Простой прием заявки:', { requestId, userId: req.user.id });
    
    if (!Number.isFinite(requestId)) {
      return res.status(400).json({ message: 'Некорректный ID заявки' });
    }

    // Простая проверка - существует ли заявка
    const request = await dbGet(
      `SELECT rq.id, rq.ride_id, rq.status, r.driver_id 
       FROM ride_requests rq 
       JOIN rides r ON r.id = rq.ride_id 
       WHERE rq.id = ?`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ message: 'Заявка не найдена' });
    }

    if (request.driver_id !== req.user.id) {
      return res.status(403).json({ message: 'Вы не водитель этой поездки' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Заявка уже обработана' });
    }

    // Просто обновляем статус
    await dbRun('UPDATE ride_requests SET status = ? WHERE id = ?', ['accepted', requestId]);

    console.log('Заявка принята:', requestId);
    res.json({ 
      message: 'Заявка принята',
      requestId: requestId,
      status: 'accepted'
    });

  } catch (err) {
    console.error('Ошибка принятия заявки:', err);
    res.status(500).json({ message: 'Ошибка принятия заявки' });
  }
});
